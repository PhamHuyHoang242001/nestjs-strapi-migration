import { ServiceDraft } from './data-service-import-service-rows.util';

// Cell of a CreateDataServiceDto property path: service fields on the service row, table/term fields on their
// row of the term sheet.
const SERVICE_KEYS: Record<string, string> = {
  request_unit_id: 'request_unit',
  division_id: 'division',
  department_id: 'department',
  consumer_ids: 'consumers',
  requester_user_ids: 'requesters',
  it_supporter_user_ids: 'it_supporters',
  service_owner_user_ids: 'service_owners',
};
const TERM_KEYS: Record<string, string> = { logical_term_id: 'logical_code' };

export function locateDtoPath(d: ServiceDraft, path: string) {
  const parts = path.split('.');
  if (parts[0] === 'source_tables' && parts.length > 1) {
    const t = Number(parts[1]);
    if (parts[2] === 'terms' && parts.length > 3) {
      const row = d.termRows[t]?.[Number(parts[3])];
      if (row !== undefined) return { sheet: 'TERMS' as const, row, key: TERM_KEYS[parts[4]] ?? parts[4] };
    }
    const row = d.tableRows[t];
    if (row !== undefined) {
      const key = parts[2] === 'name' ? 'table_name' : parts[2] === 'description' ? 'table_description' : undefined;
      return { sheet: 'TERMS' as const, row, key };
    }
  }
  if (parts[0] === 'api_spec' || parts[0] === 'sftp_spec') return { sheet: d.sheet, row: d.row, key: parts[1] };
  return { sheet: d.sheet, row: d.row, key: SERVICE_KEYS[parts[0]] ?? parts[0] };
}
