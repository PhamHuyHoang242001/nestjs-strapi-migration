import { LogicalTermBodyDto } from '../../dictionary/dto';
import { ImportIssueCollector, validateDto } from './data-service-import-issue-collector.util';
import { ImportReferences, lower } from './data-service-import-reference-lookup.service';
import { refKey, ServiceDraft } from './data-service-import-service-rows.util';
import { ImportRow } from './data-service-import-workbook-reader.util';

// A logical term to create from LOGICAL_TERM_MOI.
export interface LogicalDraft {
  row: number;
  code: string;
  short_description: string;
  example_value?: string;
  // Services (by reference) whose terms point at it.
  usedBy: Set<string>;
  valid?: boolean;
}

const YES = new Set(['có', 'co', 'x', 'true', '1', 'yes', 'y']);
const NO = new Set(['không', 'khong', 'false', '0', 'no', 'n']);

// LOGICAL_TERM_MOI rows that may be created, keyed by lower-case code. Rows with a problem are returned in
// `invalid` so the terms pointing at them fail too, instead of being created unmapped.
export async function buildLogicalDrafts(
  rows: ImportRow[],
  refs: ImportReferences,
  issues: ImportIssueCollector,
): Promise<{ drafts: Map<string, LogicalDraft>; invalid: Set<string> }> {
  const drafts = new Map<string, LogicalDraft>();
  const invalid = new Set<string>();
  const count = new Map<string, number>();
  rows.forEach((r) => r.values.code && count.set(lower(r.values.code), (count.get(lower(r.values.code)) ?? 0) + 1));
  for (const r of rows) {
    const v = r.values;
    const key = lower(v.code);
    if (v.code === '') issues.add('LOGICAL', r.row, 'code', 'REQUIRED', 'Không được để trống');
    if (v.short_description === '')
      issues.add('LOGICAL', r.row, 'short_description', 'REQUIRED', 'Không được để trống');
    if (v.code && (count.get(key) ?? 0) > 1) {
      issues.add('LOGICAL', r.row, 'code', 'DUPLICATE_IN_FILE', `Mã "${v.code}" khai nhiều lần`);
    }
    if (v.code && refs.logicalTerms.has(key)) {
      issues.add(
        'LOGICAL',
        r.row,
        'code',
        'LOGICAL_TERM_CODE_EXISTS',
        'Mã đã có trong hệ thống: xoá dòng này, các physical ghi mã này sẽ map vào logical có sẵn',
      );
    }
    if (!refs.canCreateLogical) {
      issues.add('LOGICAL', r.row, undefined, 'LOGICAL_TERM_FORBIDDEN', 'Bạn không có quyền tạo logical term');
    }
    // Same rules as the logical term API; one placeholder physical id stands in for the mapping built later.
    await validateDto(
      LogicalTermBodyDto,
      {
        code: v.code,
        short_description: v.short_description,
        example_value: v.example_value || undefined,
        physical_term_ids: [1],
      },
      issues,
      (path) => ({ sheet: 'LOGICAL', row: r.row, key: path === 'physical_term_ids' ? undefined : path }),
    );
    if (!v.code || refs.logicalTerms.has(key)) continue;
    if (issues.hasError('LOGICAL', r.row)) {
      invalid.add(key);
      continue;
    }
    drafts.set(key, {
      row: r.row,
      code: v.code,
      short_description: v.short_description,
      example_value: v.example_value || undefined,
      usedBy: new Set(),
    });
  }
  return { drafts, invalid };
}

// Groups BANG_NGUON_PHYSICAL_TERM rows into each service's source_tables and records which sheet row every
// table and term came from. Every table is new: a name taken in the system or by another service of the file
// is an error.
export function attachTermRows(
  rows: ImportRow[],
  services: Map<string, ServiceDraft>,
  duplicateRefs: Set<string>,
  logical: { drafts: Map<string, LogicalDraft>; invalid: Set<string> },
  refs: ImportReferences,
  issues: ImportIssueCollector,
): void {
  // Which services use each table name, to catch one name on two services.
  const servicesOfName = new Map<string, Set<string>>();
  rows.forEach((r) => {
    if (!r.values.table_name || !r.values.service_ref) return;
    const set = servicesOfName.get(lower(r.values.table_name)) ?? new Set<string>();
    set.add(refKey(r.values.service_ref));
    servicesOfName.set(lower(r.values.table_name), set);
  });
  const tables = new Map<string, { index: number; codes: Set<string>; description: string }>();

  for (const r of rows) {
    const v = r.values;
    for (const key of ['service_ref', 'table_name', 'code', 'technical_description', 'data_type']) {
      if (v[key] === '') issues.add('TERMS', r.row, key, 'REQUIRED', 'Không được để trống');
    }
    const ref = refKey(v.service_ref);
    const service = services.get(ref);
    service?.sheetTermRows.push(r.row);
    if (v.service_ref && !service) {
      issues.add(
        'TERMS',
        r.row,
        'service_ref',
        duplicateRefs.has(ref) ? 'DUPLICATE_REF' : 'SERVICE_REF_NOT_FOUND',
        duplicateRefs.has(ref)
          ? 'Mã tham chiếu bị trùng ở sheet dịch vụ'
          : `Không có dịch vụ với mã tham chiếu "${v.service_ref}"`,
      );
    }
    const nameKey = lower(v.table_name);
    if (v.table_name && refs.sourceTableNames.has(nameKey)) {
      issues.add('TERMS', r.row, 'table_name', 'SOURCE_TABLE_NAME_EXISTS', 'Tên bảng đã có trong hệ thống');
    } else if (v.table_name && (servicesOfName.get(nameKey)?.size ?? 0) > 1) {
      issues.add(
        'TERMS',
        r.row,
        'table_name',
        'SOURCE_TABLE_NAME_DUPLICATE',
        'Tên bảng được dùng cho nhiều dịch vụ trong file',
      );
    }

    let isRequired: boolean | string = false;
    if (v.is_required !== '') {
      const t = lower(v.is_required);
      isRequired = YES.has(t) ? true : NO.has(t) ? false : v.is_required;
    }
    let logicalId: number | null = null;
    if (v.logical_code) {
      const lk = lower(v.logical_code);
      const existing = refs.logicalTerms.get(lk);
      if (existing !== undefined) logicalId = existing;
      else if (logical.invalid.has(lk)) {
        issues.add(
          'TERMS',
          r.row,
          'logical_code',
          'LOGICAL_TERM_INVALID',
          'Logical term mới này đang lỗi ở sheet LOGICAL_TERM_MOI',
        );
      } else if (!logical.drafts.has(lk)) {
        issues.add(
          'TERMS',
          r.row,
          'logical_code',
          'LOGICAL_TERM_NOT_FOUND',
          'Mã chưa có trong hệ thống và không khai ở sheet LOGICAL_TERM_MOI',
        );
      }
    }
    if (!service || !v.table_name) continue;

    const tableKey = `${ref}|${nameKey}`;
    let table = tables.get(tableKey);
    if (!table) {
      table = { index: service.tableRows.length, codes: new Set(), description: v.table_description };
      tables.set(tableKey, table);
      service.tableRows.push(r.row);
      service.termRows.push([]);
      const list = (service.plain.source_tables as unknown[] | undefined) ?? [];
      list.push({ name: v.table_name, description: v.table_description || undefined, terms: [] });
      service.plain.source_tables = list;
    } else if (v.table_description && v.table_description !== table.description) {
      issues.add(
        'TERMS',
        r.row,
        'table_description',
        'TABLE_DESCRIPTION_IGNORED',
        'Khác mô tả ở dòng đầu của bảng; hệ thống dùng mô tả ở dòng đầu',
        true,
      );
    }
    if (v.code && table.codes.has(lower(v.code))) {
      issues.add('TERMS', r.row, 'code', 'PHYSICAL_CODE_DUPLICATE', `Mã "${v.code}" bị lặp trong bảng ${v.table_name}`);
      continue;
    }
    table.codes.add(lower(v.code));
    const group = (service.plain.source_tables as Array<{ terms: unknown[] }>)[table.index];
    group.terms.push({
      code: v.code,
      technical_description: v.technical_description,
      data_type: v.data_type,
      is_required: isRequired,
      example_value: v.example_value || undefined,
      logical_term_id: logicalId,
    });
    service.termRows[table.index].push(r.row);
    const draft = v.logical_code ? logical.drafts.get(lower(v.logical_code)) : undefined;
    if (draft) {
      draft.usedBy.add(ref);
      service.newLogicalLinks.push({ logicalCode: draft.code, tableName: v.table_name, termCode: v.code, row: r.row });
    }
  }
}
