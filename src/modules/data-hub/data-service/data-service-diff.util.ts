import { DataHubServiceChange } from '@modules/databases/data-hub-enums';
import { FIELD_META, FieldMeta } from './data-service-field-meta';

// A referenced row: `key` decides equality (id), `label` is what the change log shows (code / email / column).
export interface RefItem {
  key: number | string;
  label: string;
}

// Flat view of one version: scalars as-is, json as parsed values, refs as RefItem, ref lists as RefItem[].
export type DiffSnapshot = Record<string, unknown>;

const isBlank = (v: unknown): boolean => v === null || v === undefined || v === '';

// Object keys sorted recursively so two JSON samples that differ only in key order compare equal.
export function stableStringify(value: unknown): string {
  if (value === undefined || value === null) return 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const body = Object.keys(obj)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`);
    return `{${body.join(',')}}`;
  }
  return JSON.stringify(value);
}

// Scalars compare by their string form; an unexpected object falls back to stable JSON instead of [object Object].
const scalarSignature = (value: unknown): string =>
  typeof value === 'object' ? stableStringify(value) : String(value as string | number | boolean);

const sortedItems = (value: unknown): RefItem[] =>
  (Array.isArray(value) ? (value as RefItem[]) : [])
    .slice()
    .sort((a, b) => String(a.key).localeCompare(String(b.key), 'en', { numeric: true }));

interface Normalized {
  signature: string;
  display: unknown;
}

function normalize(meta: FieldMeta, value: unknown): Normalized {
  switch (meta.kind) {
    case 'json': {
      const empty = isBlank(value);
      return { signature: empty ? '' : stableStringify(value), display: empty ? null : value };
    }
    case 'ref': {
      const item = value as RefItem | null | undefined;
      return { signature: item ? String(item.key) : '', display: item ? item.label : null };
    }
    case 'refList': {
      const items = sortedItems(value);
      return {
        signature: items.map((i) => String(i.key)).join(','),
        // Display alphabetically; equality still uses the ids.
        display: items.map((i) => i.label).sort((a, b) => a.localeCompare(b)),
      };
    }
    default:
      return { signature: isBlank(value) ? '' : scalarSignature(value), display: isBlank(value) ? null : value };
  }
}

export function buildChange(meta: FieldMeta, oldValue: unknown, newValue: unknown): DataHubServiceChange {
  return {
    section: meta.section,
    field: meta.field,
    label_vi: meta.label_vi,
    label_en: meta.label_en,
    old: normalize(meta, oldValue).display,
    new: normalize(meta, newValue).display,
  };
}

// Changed fields between two snapshots; `previous = null` lists every non-empty field of `next`
// (used for the CREATE entry). Empty result means nothing changed.
export function diffSnapshots(previous: DiffSnapshot | null, next: DiffSnapshot): DataHubServiceChange[] {
  const changes: DataHubServiceChange[] = [];
  for (const meta of FIELD_META) {
    const before = normalize(meta, previous?.[meta.field]);
    const after = normalize(meta, next[meta.field]);
    if (before.signature === after.signature) continue;
    changes.push(buildChange(meta, previous?.[meta.field], next[meta.field]));
  }
  return changes;
}

// Single-field change outside a snapshot diff (e.g. active/inactive toggle).
export function singleFieldChange(field: string, oldValue: unknown, newValue: unknown): DataHubServiceChange {
  const meta = FIELD_META.find((m) => m.field === field);
  if (!meta) throw new Error(`Unknown change field: ${field}`);
  return buildChange(meta, oldValue, newValue);
}
