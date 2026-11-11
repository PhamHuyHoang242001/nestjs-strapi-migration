import { Injectable } from '@nestjs/common';
import { normalizeDomainUrl } from '@modules/domain/domain-url.util';
import { DataHubAccessService, DataHubCaller } from '../common/data-hub-access.service';
import { DH_PERMISSIONS } from '../common/data-hub-permission-codes';
import { DataHubDataServiceWriteService } from '../data-service/data-hub-data-service-write.service';
import { CreateDataServiceDto, UpdateDataServiceDto } from '../data-service/dto';
import {
  checkRequired,
  ImportRunGuard,
  lookupCode,
  lookupMany,
  resolveActiveConsumer,
  resolveUser,
} from './import-helpers.util';
import { SERVICE_IMPORT_LAYOUTS, SERVICE_TYPE_OF, SERVICES_SHEET, ServiceImportKind } from './import-layouts';
import { DataServiceImportReferenceLookupService, ExistingService, ImportReferences } from './import-lookups.service';
import {
  checkRowRight,
  inFileCounts,
  loadUpsertRights,
  rowNote,
  rowOutcome,
  summarize,
  UpsertAction,
  UpsertEntry,
  UpsertRights,
  UpsertSummary,
  writeRow,
} from './import-upsert.util';
import {
  buildResultFile,
  ImportIssueCollector,
  ImportIssueWithLevel,
  ImportRow,
  loadImportWorkbook,
  RowResult,
  validateDto,
  withSheetNames,
} from './import-workbook.util';

// Service code typed in the file: upper-cased, letters, digits, _ and -.
export const SERVICE_CODE_PATTERN = /^[A-Z0-9_-]{2,100}$/;

// One service of the upload, from one row.
export interface ServiceDraft {
  row: number;
  code: string;
  action: UpsertAction;
  existing?: ExistingService;
  plain: Record<string, unknown>;
}

const API_SPEC_KEYS = [
  'method',
  'endpoint_path',
  'auth_type',
  'encryption',
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

function parseJson(r: ImportRow, key: string, issues: ImportIssueCollector): unknown {
  const text = r.values[key];
  if (text === '') return undefined;
  try {
    return JSON.parse(text);
  } catch {
    issues.add(SERVICES_SHEET, r.row, key, 'INVALID_JSON', 'Không phải JSON hợp lệ');
    return undefined;
  }
}

// Code cell: required, valid, not repeated in the file and, when it already exists, of a service of this type.
function checkServiceCode(
  kind: ServiceImportKind,
  r: ImportRow,
  code: string,
  existing: ExistingService | undefined,
  issues: ImportIssueCollector,
): void {
  if (code === '') return; // reported by checkRequired
  if (!SERVICE_CODE_PATTERN.test(code)) {
    issues.add(
      SERVICES_SHEET,
      r.row,
      'service_code',
      'INVALID_VALUE',
      'Mã dịch vụ chỉ gồm chữ, số, dấu _ hoặc -, 2-100 ký tự',
    );
  }
  if (existing && existing.type !== SERVICE_TYPE_OF[kind]) {
    issues.add(
      SERVICES_SHEET,
      r.row,
      'service_code',
      'SERVICE_TYPE_MISMATCH',
      `Mã "${code}" là dịch vụ ${existing.type}, không import ở file ${kind}`,
    );
  }
}

// The caller may write only in departments they belong to (with the right code). An update needs both the
// service's current department and the department of the row.
function checkDepartment(
  draft: Pick<ServiceDraft, 'action' | 'existing'>,
  r: ImportRow,
  departmentId: number | undefined,
  refs: ImportReferences,
  issues: ImportIssueCollector,
): void {
  const writable = refs.writableDepartmentIds[draft.action];
  if (writable === null) return;
  const verb = draft.action === 'create' ? 'tạo dịch vụ ở' : 'cập nhật dịch vụ của';
  if (departmentId !== undefined && !writable.has(departmentId)) {
    issues.add(SERVICES_SHEET, r.row, 'department', 'DEPARTMENT_FORBIDDEN', `Bạn không có quyền ${verb} đơn vị này`);
  }
  const current = draft.existing?.departmentId;
  if (draft.action === 'update' && (current === null || (current !== undefined && !writable.has(current)))) {
    issues.add(
      SERVICES_SHEET,
      r.row,
      'service_code',
      'DEPARTMENT_FORBIDDEN',
      'Bạn không thuộc đơn vị phát hành hiện tại của dịch vụ này',
    );
  }
}

// IT hỗ trợ from its three columns; the DTO checks the values and that at least one is given.
const itSupportOf = (v: Record<string, string>) => ({
  email: optional(v.it_support_email),
  phone: optional(v.it_support_phone),
  link: optional(v.it_support_link),
});

// Plain create body of a row (the DTO pass validates it afterwards); lookups that fail are reported on the cell.
export function buildServiceDraft(
  kind: ServiceImportKind,
  r: ImportRow,
  refs: ImportReferences,
  rights: UpsertRights,
  issues: ImportIssueCollector,
): ServiceDraft {
  const v = r.values;
  const code = v.service_code.toUpperCase();
  const existing = code ? refs.services.get(code.toLowerCase()) : undefined;
  const action: UpsertAction = existing ? 'update' : 'create';
  checkRequired(SERVICE_IMPORT_LAYOUTS[kind], SERVICES_SHEET, r, issues);
  checkServiceCode(kind, r, code, existing, issues);
  checkRowRight(rights, action, { sheet: SERVICES_SHEET, row: r.row, key: 'service_code' }, 'dịch vụ', issues);
  const departmentId = lookupCode(SERVICES_SHEET, r, 'department', refs.departments, issues);
  checkDepartment({ action, existing }, r, departmentId, refs, issues);
  const user = resolveUser(refs.users);
  const plain: Record<string, unknown> = {
    service_type: SERVICE_TYPE_OF[kind],
    name: v.name,
    short_description: v.short_description,
    purpose: optional(v.purpose),
    service_ops: optional(v.service_ops),
    usage_guide_html: v.usage_guide_html,
    request_unit_id: lookupCode(SERVICES_SHEET, r, 'request_unit', refs.requestUnits, issues),
    division_id: lookupCode(SERVICES_SHEET, r, 'division', refs.divisions, issues),
    department_id: departmentId,
    consumer_ids: lookupMany(SERVICES_SHEET, r, 'consumers', resolveActiveConsumer(refs.consumers), issues),
    requester_user_ids: lookupMany(SERVICES_SHEET, r, 'requesters', user, issues),
    it_support: itSupportOf(v),
    service_owner_user_ids: lookupMany(SERVICES_SHEET, r, 'service_owners', user, issues),
  };
  if (kind === 'API') {
    plain.api_spec = {
      ...specOf(API_SPEC_KEYS, v),
      domain_id: lookupDomain(r, refs.domains, issues),
      sample_request: parseJson(r, 'sample_request', issues),
      sample_response: parseJson(r, 'sample_response', issues),
    };
  } else {
    plain.sftp_spec = specOf(SFTP_SPEC_KEYS, v);
  }
  return { row: r.row, code, action, existing, plain };
}

// Base-URL cell is a url: folded like stored urls, then it must be an active domain.
function lookupDomain(r: ImportRow, domains: Map<string, number>, issues: ImportIssueCollector): number | undefined {
  const url = normalizeDomainUrl(r.values.domain);
  if (url === '') return undefined;
  const id = domains.get(url);
  if (id === undefined) {
    issues.add(
      SERVICES_SHEET,
      r.row,
      'domain',
      'DOMAIN_NOT_FOUND',
      `Base-URL "${r.values.domain}" không tồn tại hoặc ngừng hoạt động`,
    );
  }
  return id;
}

// Property of CreateDataServiceDto -> column of the sheet.
const COLUMN_OF: Record<string, string> = {
  request_unit_id: 'request_unit',
  division_id: 'division',
  department_id: 'department',
  consumer_ids: 'consumers',
  requester_user_ids: 'requesters',
  service_owner_user_ids: 'service_owners',
  domain_id: 'domain',
};
const IT_SUPPORT_COLUMN: Record<string, string> = {
  email: 'it_support_email',
  phone: 'it_support_phone',
  link: 'it_support_link',
};

export function locateServiceDtoPath(row: number, path: string) {
  const parts = path.split('.');
  let key: string;
  if (parts[0] === 'api_spec' || parts[0] === 'sftp_spec') key = COLUMN_OF[parts[1]] ?? parts[1];
  else if (parts[0] === 'it_support') key = IT_SUPPORT_COLUMN[parts[1]] ?? 'it_support_email';
  else key = COLUMN_OF[parts[0]] ?? parts[0];
  return { sheet: SERVICES_SHEET, row, key };
}

export interface DataServiceImportResult {
  dry_run: boolean;
  summary: { services: UpsertSummary };
  services: UpsertEntry[];
  issues: ImportIssueWithLevel[];
  result_file: { file_name: string; content_base64: string };
}

// Bulk create / update of API or SFTP data services by service code. Every row is checked with the create API's
// DTO rules and lookups. A new code creates the service (version 1) with exactly that code; an existing code
// updates that service (a new approved version) with the row's values, keeping its source tables and terms (the
// source table import manages those). Each valid row is written through the regular write path in its own
// transaction, so one failing service never blocks the others.
@Injectable()
export class DataServiceImportService {
  private readonly runGuard = new ImportRunGuard();

  constructor(
    private readonly lookup: DataServiceImportReferenceLookupService,
    private readonly writeService: DataHubDataServiceWriteService,
    private readonly access: DataHubAccessService,
  ) {}

  import(kind: ServiceImportKind, file: Buffer, dryRun: boolean, caller: DataHubCaller) {
    return this.runGuard.run(caller.id, dryRun, () => this.run(kind, file, dryRun, caller));
  }

  private async run(
    kind: ServiceImportKind,
    file: Buffer,
    dryRun: boolean,
    caller: DataHubCaller,
  ): Promise<DataServiceImportResult> {
    const layout = SERVICE_IMPORT_LAYOUTS[kind];
    const { workbook, sheets } = await loadImportWorkbook(file, layout);
    const rows = sheets[SERVICES_SHEET];
    const issues = new ImportIssueCollector(layout);
    const [refs, rights] = await Promise.all([
      this.lookup.load(rows, caller),
      loadUpsertRights(this.access, caller, {
        create: DH_PERMISSIONS.DATA_SERVICE_CREATE,
        update: DH_PERMISSIONS.DATA_SERVICE_UPDATE,
      }),
    ]);
    const inFile = inFileCounts(
      rows.map((r) => r.values.service_code),
      (c) => c.toUpperCase(),
    );

    const results = new Map<string, RowResult>();
    const services: UpsertEntry[] = [];
    for (const r of rows) {
      const draft = buildServiceDraft(kind, r, refs, rights, issues);
      if (draft.code && (inFile.get(draft.code) ?? 0) > 1) {
        issues.add(SERVICES_SHEET, r.row, 'service_code', 'DUPLICATE_IN_FILE', `Mã "${draft.code}" khai nhiều lần`);
      }
      const dto = await validateDto(CreateDataServiceDto, draft.plain, issues, (path) =>
        locateServiceDtoPath(r.row, path),
      );
      const entry: UpsertEntry = {
        sheet: SERVICES_SHEET,
        row: r.row,
        ref: draft.code,
        action: draft.action,
        status: issues.hasError(SERVICES_SHEET, r.row) ? 'failed' : 'valid',
      };
      if (entry.status === 'valid' && !dryRun) {
        await writeRow(entry, issues, async () => {
          const res = draft.existing
            ? await this.writeService.update(draft.existing.id, dto as unknown as UpdateDataServiceDto, caller, {
                keepSourceTables: true,
              })
            : await this.writeService.create(dto, caller, draft.code);
          return { id: res.id, code: res.service_code };
        });
      }
      services.push(entry);
      results.set(`${SERVICES_SHEET}!${r.row}`, { outcome: rowOutcome(entry.status), note: rowNote(entry, 'dịch vụ') });
    }

    return {
      dry_run: dryRun,
      summary: { services: summarize(services) },
      services: withSheetNames(layout, services),
      issues: withSheetNames(layout, issues.issues),
      result_file: await buildResultFile(layout, workbook, results, issues.issues),
    };
  }
}
