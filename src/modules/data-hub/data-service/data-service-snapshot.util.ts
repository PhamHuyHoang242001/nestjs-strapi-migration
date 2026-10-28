import { DiffSnapshot, RefItem } from './data-service-diff.util';
import { API_SPEC_FIELDS, SFTP_SPEC_FIELDS, VersionSource } from './data-service-spec.types';

// Labelled references of a version (org codes, consumer codes, physical columns, user emails).
export interface ResolvedRefs {
  requestUnit: RefItem | null;
  division: RefItem | null;
  department: RefItem | null;
  consumers: RefItem[];
  physicalTerms: RefItem[];
  sourceTables: RefItem[];
  requesters: RefItem[];
  itSupporters: RefItem[];
  serviceOwners: RefItem[];
}

// Flatten a version into the keys listed in FIELD_META so two versions can be diffed field by field.
export function buildSnapshot(source: VersionSource, refs: ResolvedRefs): DiffSnapshot {
  const snapshot: DiffSnapshot = {
    name: source.name,
    short_description: source.short_description,
    purpose: source.purpose ?? null,
    request_unit: refs.requestUnit,
    division: refs.division,
    department: refs.department,
    requesters: refs.requesters,
    it_supporters: refs.itSupporters,
    service_owners: refs.serviceOwners,
    usage_guide_html: source.usage_guide_html,
    consumers: refs.consumers,
    source_tables: refs.sourceTables,
    physical_terms: refs.physicalTerms,
  };
  if (source.api_spec) {
    for (const field of API_SPEC_FIELDS) snapshot[`api_${field}`] = source.api_spec[field] ?? null;
  }
  if (source.sftp_spec) {
    for (const field of SFTP_SPEC_FIELDS) snapshot[`sftp_${field}`] = source.sftp_spec[field] ?? null;
  }
  return snapshot;
}
