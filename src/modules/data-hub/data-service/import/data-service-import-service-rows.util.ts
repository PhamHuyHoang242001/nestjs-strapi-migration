import { DataHubServiceType } from '@modules/databases/data-hub-enums';
import { CreateDataServiceDto } from '../dto';
import { ImportIssueCollector } from './data-service-import-issue-collector.util';
import { ImportReferences, lower } from './data-service-import-reference-lookup.service';
import { IMPORT_LIMITS, ImportDataSheet, SHEET_COLUMNS } from './data-service-import-sheet-columns';
import { ImportRow, ImportSheetRows, splitList } from './data-service-import-workbook-reader.util';

// One service of the upload, from its row on DICH_VU_API / DICH_VU_SFTP plus its rows on the term sheet.
export interface ServiceDraft {
  sheet: 'API' | 'SFTP';
  row: number;
  ref: string;
  plain: Record<string, unknown>;
  // Sheet rows behind source_tables[i] (first row of the table) and source_tables[i].terms[j].
  tableRows: number[];
  termRows: number[][];
  // Every term-sheet row pointing at this service, also the ones rejected before grouping (any error there
  // stops the whole service, so it is never created with a term silently missing).
  sheetTermRows: number[];
  // Physical terms (by table + code) to attach to a logical term created from LOGICAL_TERM_MOI.
  newLogicalLinks: Array<{ logicalCode: string; tableName: string; termCode: string; row: number }>;
  dto?: CreateDataServiceDto;
  valid?: boolean;
}

export const refKey = (ref: string): string => ref.trim().toUpperCase();

const API_SPEC_KEYS = [
  'method',
  'base_url',
  'endpoint_path',
  'auth_type',
  'peak_tps',
  'update_frequency',
  'sync_mode',
  'timeout',
];
const SFTP_SPEC_KEYS = [
  'folder_path',
  'file_name_pattern',
  'file_format',
  'export_frequency',
  'max_file_size',
  'encryption',
  'flow_direction',
];
// Columns whose value is an enum code: upper-cased so "get" or "sync" still match.
const ENUM_KEYS = new Set([
  'method',
  'base_url',
  'auth_type',
  'update_frequency',
  'sync_mode',
  'file_format',
  'export_frequency',
  'encryption',
  'flow_direction',
]);

const optional = (v: string): string | undefined => (v === '' ? undefined : v);

function specOf(keys: string[], values: Record<string, string>): Record<string, unknown> {
  const spec: Record<string, unknown> = {};
  for (const k of keys) {
    const v = values[k];
    if (v !== '') spec[k] = ENUM_KEYS.has(k) ? v.toUpperCase() : v;
  }
  return spec;
}

// Required cells left empty; the DTO check would also catch them, but with a less useful message.
function checkRequired(sheet: ImportDataSheet, r: ImportRow, issues: ImportIssueCollector): void {
  for (const c of SHEET_COLUMNS[sheet]) {
    if (c.level === 'r' && r.values[c.key] === '') issues.add(sheet, r.row, c.key, 'REQUIRED', 'Không được để trống');
  }
}

function lookupOrg(
  sheet: ImportDataSheet,
  r: ImportRow,
  key: string,
  map: Map<string, number>,
  issues: ImportIssueCollector,
) {
  const code = r.values[key];
  if (code === '') return undefined;
  const id = map.get(lower(code));
  if (id === undefined) issues.add(sheet, r.row, key, 'CODE_NOT_FOUND', `Mã "${code}" không tồn tại`);
  return id;
}

function lookupMany(
  sheet: ImportDataSheet,
  r: ImportRow,
  key: string,
  resolve: (value: string) => { id?: number; error?: [string, string] },
  issues: ImportIssueCollector,
): number[] {
  const values = splitList(r.values[key]);
  const seen = new Set<string>();
  const ids: number[] = [];
  for (const v of values) {
    if (seen.has(lower(v))) {
      issues.add(sheet, r.row, key, 'DUPLICATE_VALUE', `"${v}" bị lặp`);
      continue;
    }
    seen.add(lower(v));
    const res = resolve(v);
    if (res.error) issues.add(sheet, r.row, key, res.error[0], res.error[1]);
    else if (res.id !== undefined) ids.push(res.id);
  }
  return ids;
}

function parseJson(sheet: ImportDataSheet, r: ImportRow, key: string, issues: ImportIssueCollector): unknown {
  const text = r.values[key];
  if (text === '') return undefined;
  try {
    return JSON.parse(text);
  } catch {
    issues.add(sheet, r.row, key, 'INVALID_JSON', 'Không phải JSON hợp lệ');
    return undefined;
  }
}

function buildDraft(
  sheet: 'API' | 'SFTP',
  r: ImportRow,
  refs: ImportReferences,
  issues: ImportIssueCollector,
): ServiceDraft {
  const v = r.values;
  checkRequired(sheet, r, issues);
  if (v.ref.length > IMPORT_LIMITS.REF_LENGTH) {
    issues.add(sheet, r.row, 'ref', 'TOO_LONG', `Tối đa ${IMPORT_LIMITS.REF_LENGTH} ký tự`);
  }
  const departmentId = lookupOrg(sheet, r, 'department', refs.departments, issues);
  if (departmentId !== undefined && refs.writableDepartmentIds && !refs.writableDepartmentIds.has(departmentId)) {
    issues.add(sheet, r.row, 'department', 'DEPARTMENT_FORBIDDEN', 'Bạn không có quyền tạo dịch vụ ở đơn vị này');
  }
  const user = (email: string) => {
    const id = refs.users.get(lower(email));
    if (id === undefined) return { error: ['USER_NOT_FOUND', `Không có người dùng ${email}`] as [string, string] };
    if (id === null) return { error: ['USER_AMBIGUOUS', `Email ${email} trùng nhiều người dùng`] as [string, string] };
    return { id };
  };
  const consumer = (code: string) => {
    const c = refs.consumers.get(lower(code));
    if (!c) return { error: ['CODE_NOT_FOUND', `App "${code}" không tồn tại`] as [string, string] };
    if (!c.active) return { error: ['CONSUMER_INACTIVE', `App "${code}" đang ngừng hoạt động`] as [string, string] };
    return { id: c.id };
  };
  const plain: Record<string, unknown> = {
    service_type: sheet === 'API' ? DataHubServiceType.API : DataHubServiceType.SFTP,
    name: v.name,
    short_description: v.short_description,
    purpose: optional(v.purpose),
    request_unit_id: lookupOrg(sheet, r, 'request_unit', refs.requestUnits, issues),
    division_id: lookupOrg(sheet, r, 'division', refs.divisions, issues),
    department_id: departmentId,
    consumer_ids: lookupMany(sheet, r, 'consumers', consumer, issues),
    requester_user_ids: lookupMany(sheet, r, 'requesters', user, issues),
    it_supporter_user_ids: lookupMany(sheet, r, 'it_supporters', user, issues),
    service_owner_user_ids: lookupMany(sheet, r, 'service_owners', user, issues),
  };
  if (sheet === 'API') {
    plain.api_spec = {
      ...specOf(API_SPEC_KEYS, v),
      sample_request: parseJson(sheet, r, 'sample_request', issues),
      sample_response: parseJson(sheet, r, 'sample_response', issues),
    };
  } else {
    plain.sftp_spec = specOf(SFTP_SPEC_KEYS, v);
  }
  return { sheet, row: r.row, ref: v.ref, plain, tableRows: [], termRows: [], sheetTermRows: [], newLogicalLinks: [] };
}

// Drafts of every service row, keyed by reference (upper case). A reference used twice is reported on both rows
// and neither row is kept, so terms cannot attach to the wrong one.
export function buildServiceDrafts(
  sheets: ImportSheetRows,
  refs: ImportReferences,
  issues: ImportIssueCollector,
): { drafts: Map<string, ServiceDraft>; duplicateRefs: Set<string> } {
  const all = [
    ...sheets.API.map((r) => ({ sheet: 'API' as const, r })),
    ...sheets.SFTP.map((r) => ({ sheet: 'SFTP' as const, r })),
  ];
  const count = new Map<string, number>();
  all.forEach(({ r }) => r.values.ref && count.set(refKey(r.values.ref), (count.get(refKey(r.values.ref)) ?? 0) + 1));
  const drafts = new Map<string, ServiceDraft>();
  const duplicateRefs = new Set<string>();
  for (const { sheet, r } of all) {
    const draft = buildDraft(sheet, r, refs, issues);
    if (!r.values.ref) continue;
    if ((count.get(refKey(r.values.ref)) ?? 0) > 1) {
      issues.add(sheet, r.row, 'ref', 'DUPLICATE_REF', `Mã tham chiếu "${r.values.ref}" bị trùng trong file`);
      duplicateRefs.add(refKey(r.values.ref));
      continue;
    }
    drafts.set(refKey(r.values.ref), draft);
  }
  return { drafts, duplicateRefs };
}
