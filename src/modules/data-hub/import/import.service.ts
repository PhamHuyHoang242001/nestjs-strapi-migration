import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DataHubCaller } from '../common/data-hub-access.service';
import { liveSql } from '../common/data-hub-query.util';
import { DataHubConsumerWriteService } from '../consumer/data-hub-consumer-write.service';
import { CreateConsumerDto } from '../consumer/dto';
import { DataHubDataServiceWriteService } from '../data-service/data-hub-data-service-write.service';
import { LogicalTermWriteService } from '../dictionary/logical-term-write.service';
import { ImportDataServiceDto, LogicalTermImportRowDto } from './import-dto';
import {
  checkRequired,
  codeMap,
  errorText,
  ImportRunGuard,
  lookupCode,
  lookupMany,
  resolveActiveConsumer,
  resolveUser,
  uniqueLower,
  userMap,
} from './import-helpers.util';
import {
  CONSUMER_IMPORT_LAYOUT,
  LOGICAL_TERM_IMPORT_LAYOUT,
  SERVICE_IMPORT_LAYOUTS,
  SERVICE_TYPE_OF,
  SERVICES_SHEET,
  ServiceImportKind,
} from './import-layouts';
import { DataServiceImportReferenceLookupService, ImportReferences } from './import-lookups.service';
import {
  buildResultFile,
  ImportIssueCollector,
  ImportIssueWithLevel,
  ImportRow,
  loadImportWorkbook,
  RowResult,
  splitList,
  validateDto,
  withSheetNames,
} from './import-workbook.util';

const CONSUMER_SHEET = 'CONSUMERS';
// Property of the create body -> column of the sheet.
const CONSUMER_COLUMN_OF: Record<string, string> = { division_id: 'division', so_app_user_ids: 'so_apps' };

export interface ConsumerImportResult {
  dry_run: boolean;
  summary: { consumers: { total: number; valid: number; created: number; failed: number } };
  consumers: Array<{ sheet: string; row: number; ref: string; status: string; id?: number; code?: string }>;
  issues: ImportIssueWithLevel[];
  result_file: { file_name: string; content_base64: string };
}

// Bulk create of App thụ hưởng. Each row is checked with CreateConsumerDto (the create API's own rules) and the
// same lookups (division by code, SO APP by email); each valid row is then created through the consumer write
// service in its own transaction.
@Injectable()
export class ConsumerImportService {
  private readonly runGuard = new ImportRunGuard();

  constructor(
    private readonly dataSource: DataSource,
    private readonly writeService: DataHubConsumerWriteService,
  ) {}

  import(file: Buffer, dryRun: boolean, caller: DataHubCaller): Promise<ConsumerImportResult> {
    return this.runGuard.run(caller.id, dryRun, () => this.run(file, dryRun, caller));
  }

  private async run(file: Buffer, dryRun: boolean, caller: DataHubCaller): Promise<ConsumerImportResult> {
    const { workbook, sheets } = await loadImportWorkbook(file, CONSUMER_IMPORT_LAYOUT);
    const rows = sheets[CONSUMER_SHEET];
    const issues = new ImportIssueCollector(CONSUMER_IMPORT_LAYOUT);
    const upper = (code: string) => code.toUpperCase();
    const [divisions, users, taken] = await Promise.all([
      codeMap(this.dataSource, 'data_hub_divisions', uniqueLower(rows.map((r) => r.values.division))),
      userMap(this.dataSource, uniqueLower(rows.flatMap((r) => splitList(r.values.so_apps)))),
      this.existingCodes(rows.map((r) => upper(r.values.code))),
    ]);
    const inFile = new Map<string, number>();
    rows.forEach((r) => r.values.code && inFile.set(upper(r.values.code), (inFile.get(upper(r.values.code)) ?? 0) + 1));

    const results = new Map<string, RowResult>();
    const entries: ConsumerImportResult['consumers'] = [];
    for (const r of rows) {
      const v = r.values;
      checkRequired(CONSUMER_IMPORT_LAYOUT, CONSUMER_SHEET, r, issues);
      if (v.code && taken.has(upper(v.code))) {
        issues.add(CONSUMER_SHEET, r.row, 'code', 'CONSUMER_CODE_EXISTS', 'Mã app đã có trong hệ thống');
      }
      if (v.code && (inFile.get(upper(v.code)) ?? 0) > 1) {
        issues.add(CONSUMER_SHEET, r.row, 'code', 'DUPLICATE_IN_FILE', `Mã "${v.code}" khai nhiều lần`);
      }
      const plain = {
        code: v.code,
        name: v.name,
        category: v.category.toUpperCase(),
        division_id: lookupCode(CONSUMER_SHEET, r, 'division', divisions, issues),
        short_description: v.short_description,
        so_app_user_ids: lookupMany(CONSUMER_SHEET, r, 'so_apps', resolveUser(users), issues),
      };
      const dto = await validateDto(CreateConsumerDto, plain, issues, (path) => ({
        sheet: CONSUMER_SHEET,
        row: r.row,
        key: CONSUMER_COLUMN_OF[path] ?? path,
      }));
      const entry: ConsumerImportResult['consumers'][number] = {
        sheet: CONSUMER_SHEET,
        row: r.row,
        ref: v.code,
        status: issues.hasError(CONSUMER_SHEET, r.row) ? 'failed' : 'valid',
      };
      if (entry.status === 'valid' && !dryRun) {
        try {
          const res = await this.writeService.create(dto, caller.id);
          Object.assign(entry, { status: 'created', id: res.id, code: res.code });
        } catch (err) {
          entry.status = 'failed';
          issues.add(CONSUMER_SHEET, r.row, undefined, 'CREATE_FAILED', errorText(err));
        }
      }
      entries.push(entry);
      results.set(`${CONSUMER_SHEET}!${r.row}`, {
        outcome: entry.status === 'created' ? 'created' : entry.status === 'valid' ? 'valid' : 'failed',
        note: entry.code ? `Mã app: ${entry.code}` : undefined,
      });
    }

    const failed = entries.filter((e) => e.status === 'failed').length;
    return {
      dry_run: dryRun,
      summary: {
        consumers: {
          total: rows.length,
          valid: rows.length - failed,
          created: entries.filter((e) => e.status === 'created').length,
          failed,
        },
      },
      consumers: withSheetNames(CONSUMER_IMPORT_LAYOUT, entries),
      issues: withSheetNames(CONSUMER_IMPORT_LAYOUT, issues.issues),
      result_file: await buildResultFile(CONSUMER_IMPORT_LAYOUT, workbook, results, issues.issues),
    };
  }

  // Upper-case codes of live consumers among the given ones.
  private async existingCodes(codes: string[]): Promise<Set<string>> {
    const wanted = [...new Set(codes.filter(Boolean))];
    if (wanted.length === 0) return new Set();
    const rows: Array<{ code: string }> = await this.dataSource.query(
      `SELECT c.code FROM data_hub_consumers c WHERE UPPER(c.code) = ANY($1) AND ${liveSql('c')}`,
      [wanted],
    );
    return new Set(rows.map((r) => r.code.toUpperCase()));
  }
}

const LOGICAL_SHEET = 'TERMS';

export interface LogicalTermImportResult {
  dry_run: boolean;
  summary: { logical_terms: { total: number; valid: number; created: number; failed: number } };
  logical_terms: Array<{ sheet: string; row: number; ref: string; status: string; id?: number; code?: string }>;
  issues: ImportIssueWithLevel[];
  result_file: { file_name: string; content_base64: string };
}

// Bulk create of logical terms with no physical terms (allowed only here; the UI create/edit still needs one).
// Each row is validated with the create body's own rules and created in its own transaction.
@Injectable()
export class LogicalTermImportService {
  private readonly runGuard = new ImportRunGuard();

  constructor(
    private readonly dataSource: DataSource,
    private readonly writeService: LogicalTermWriteService,
  ) {}

  import(file: Buffer, dryRun: boolean, caller: DataHubCaller): Promise<LogicalTermImportResult> {
    return this.runGuard.run(caller.id, dryRun, () => this.run(file, dryRun, caller));
  }

  private async run(file: Buffer, dryRun: boolean, caller: DataHubCaller): Promise<LogicalTermImportResult> {
    const { workbook, sheets } = await loadImportWorkbook(file, LOGICAL_TERM_IMPORT_LAYOUT);
    const rows = sheets[LOGICAL_SHEET];
    const issues = new ImportIssueCollector(LOGICAL_TERM_IMPORT_LAYOUT);
    const taken = await this.existingCodes(rows.map((r) => r.values.code));
    const inFile = new Map<string, number>();
    const key = (code: string) => code.toLowerCase();
    rows.forEach((r) => r.values.code && inFile.set(key(r.values.code), (inFile.get(key(r.values.code)) ?? 0) + 1));

    const results = new Map<string, RowResult>();
    const entries: LogicalTermImportResult['logical_terms'] = [];
    for (const r of rows) {
      const v = r.values;
      checkRequired(LOGICAL_TERM_IMPORT_LAYOUT, LOGICAL_SHEET, r, issues);
      if (v.code && taken.has(key(v.code))) {
        issues.add(LOGICAL_SHEET, r.row, 'code', 'LOGICAL_TERM_CODE_EXISTS', 'Mã đã có trong hệ thống');
      }
      if (v.code && (inFile.get(key(v.code)) ?? 0) > 1) {
        issues.add(LOGICAL_SHEET, r.row, 'code', 'DUPLICATE_IN_FILE', `Mã "${v.code}" khai nhiều lần`);
      }
      const dto = await validateDto(
        LogicalTermImportRowDto,
        { code: v.code, short_description: v.short_description, example_value: v.example_value || undefined },
        issues,
        (path) => ({ sheet: LOGICAL_SHEET, row: r.row, key: path }),
      );
      const entry: LogicalTermImportResult['logical_terms'][number] = {
        sheet: LOGICAL_SHEET,
        row: r.row,
        ref: v.code,
        status: issues.hasError(LOGICAL_SHEET, r.row) ? 'failed' : 'valid',
      };
      if (entry.status === 'valid' && !dryRun) {
        try {
          const res = await this.writeService.create({ ...dto, physical_term_ids: [] }, caller.id);
          Object.assign(entry, { status: 'created', id: res.id, code: res.code });
        } catch (err) {
          entry.status = 'failed';
          issues.add(LOGICAL_SHEET, r.row, undefined, 'CREATE_FAILED', errorText(err));
        }
      }
      entries.push(entry);
      results.set(`${LOGICAL_SHEET}!${r.row}`, {
        outcome: entry.status === 'created' ? 'created' : entry.status === 'valid' ? 'valid' : 'failed',
        note: entry.id ? `Đã tạo thuật ngữ #${entry.id}` : undefined,
      });
    }
    const failed = entries.filter((e) => e.status === 'failed').length;
    return {
      dry_run: dryRun,
      summary: {
        logical_terms: {
          total: rows.length,
          valid: rows.length - failed,
          created: entries.filter((e) => e.status === 'created').length,
          failed,
        },
      },
      logical_terms: withSheetNames(LOGICAL_TERM_IMPORT_LAYOUT, entries),
      issues: withSheetNames(LOGICAL_TERM_IMPORT_LAYOUT, issues.issues),
      result_file: await buildResultFile(LOGICAL_TERM_IMPORT_LAYOUT, workbook, results, issues.issues),
    };
  }

  // Lower-case codes of live logical terms among the given ones.
  private async existingCodes(codes: string[]): Promise<Set<string>> {
    const wanted = [...new Set(codes.filter(Boolean).map((c) => c.toLowerCase()))];
    if (wanted.length === 0) return new Set();
    const rows: Array<{ code: string }> = await this.dataSource.query(
      `SELECT t.code FROM data_hub_logical_terms t WHERE LOWER(t.code) = ANY($1) AND ${liveSql('t')}`,
      [wanted],
    );
    return new Set(rows.map((r) => r.code.toLowerCase()));
  }
}

// One service of the upload, from one row.
export interface ServiceDraft {
  row: number;
  plain: Record<string, unknown>;
  dto?: ImportDataServiceDto;
  valid?: boolean;
}

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

// Plain create body of a row (the DTO pass validates it afterwards); lookups that fail are reported on the cell.
export function buildServiceDraft(
  kind: ServiceImportKind,
  r: ImportRow,
  refs: ImportReferences,
  issues: ImportIssueCollector,
): ServiceDraft {
  const v = r.values;
  checkRequired(SERVICE_IMPORT_LAYOUTS[kind], SERVICES_SHEET, r, issues);
  const departmentId = lookupCode(SERVICES_SHEET, r, 'department', refs.departments, issues);
  if (departmentId !== undefined && refs.writableDepartmentIds && !refs.writableDepartmentIds.has(departmentId)) {
    issues.add(
      SERVICES_SHEET,
      r.row,
      'department',
      'DEPARTMENT_FORBIDDEN',
      'Bạn không có quyền tạo dịch vụ ở đơn vị này',
    );
  }
  const user = resolveUser(refs.users);
  const plain: Record<string, unknown> = {
    service_type: SERVICE_TYPE_OF[kind],
    name: v.name,
    short_description: v.short_description,
    purpose: optional(v.purpose),
    request_unit_id: lookupCode(SERVICES_SHEET, r, 'request_unit', refs.requestUnits, issues),
    division_id: lookupCode(SERVICES_SHEET, r, 'division', refs.divisions, issues),
    department_id: departmentId,
    consumer_ids: lookupMany(SERVICES_SHEET, r, 'consumers', resolveActiveConsumer(refs.consumers), issues),
    requester_user_ids: lookupMany(SERVICES_SHEET, r, 'requesters', user, issues),
    it_supporter_user_ids: lookupMany(SERVICES_SHEET, r, 'it_supporters', user, issues),
    service_owner_user_ids: lookupMany(SERVICES_SHEET, r, 'service_owners', user, issues),
  };
  if (kind === 'API') {
    plain.api_spec = {
      ...specOf(API_SPEC_KEYS, v),
      sample_request: parseJson(r, 'sample_request', issues),
      sample_response: parseJson(r, 'sample_response', issues),
    };
  } else {
    plain.sftp_spec = specOf(SFTP_SPEC_KEYS, v);
  }
  return { row: r.row, plain };
}

// Property of CreateDataServiceDto -> column of the sheet.
const COLUMN_OF: Record<string, string> = {
  request_unit_id: 'request_unit',
  division_id: 'division',
  department_id: 'department',
  consumer_ids: 'consumers',
  requester_user_ids: 'requesters',
  it_supporter_user_ids: 'it_supporters',
  service_owner_user_ids: 'service_owners',
};

export function locateServiceDtoPath(row: number, path: string) {
  const parts = path.split('.');
  const key = parts[0] === 'api_spec' || parts[0] === 'sftp_spec' ? parts[1] : (COLUMN_OF[parts[0]] ?? parts[0]);
  return { sheet: SERVICES_SHEET, row, key };
}

export interface DataServiceImportResult {
  dry_run: boolean;
  summary: { services: { total: number; valid: number; created: number; failed: number } };
  services: Array<{ sheet: string; row: number; ref: string; status: string; id?: number; service_code?: string }>;
  issues: ImportIssueWithLevel[];
  result_file: { file_name: string; content_base64: string };
}

// Bulk create of API or SFTP data services (version 1). Every row is checked with the same DTO rules and lookups
// as the create API (except that consumers are optional); then, unless dry run, each valid row is created through
// the regular create path in its own transaction, so one failing service never blocks the others. Source tables
// and physical terms are added afterwards by the source table import.
@Injectable()
export class DataServiceImportService {
  private readonly runGuard = new ImportRunGuard();

  constructor(
    private readonly lookup: DataServiceImportReferenceLookupService,
    private readonly writeService: DataHubDataServiceWriteService,
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
    const refs = await this.lookup.load(rows, caller);

    const results = new Map<string, RowResult>();
    const services: DataServiceImportResult['services'] = [];
    for (const r of rows) {
      const draft = buildServiceDraft(kind, r, refs, issues);
      const dto = await validateDto(ImportDataServiceDto, draft.plain, issues, (path) =>
        locateServiceDtoPath(r.row, path),
      );
      const entry: DataServiceImportResult['services'][number] = {
        sheet: SERVICES_SHEET,
        row: r.row,
        ref: r.values.name,
        status: issues.hasError(SERVICES_SHEET, r.row) ? 'failed' : 'valid',
      };
      if (entry.status === 'valid' && !dryRun) {
        try {
          // No consumers is allowed only here (the API requires 1..20), hence the explicit default.
          const res = await this.writeService.create({ ...dto, consumer_ids: dto.consumer_ids ?? [] }, caller);
          Object.assign(entry, { status: 'created', id: res.id, service_code: res.service_code });
        } catch (err) {
          entry.status = 'failed';
          issues.add(SERVICES_SHEET, r.row, undefined, 'CREATE_FAILED', errorText(err));
        }
      }
      services.push(entry);
      results.set(`${SERVICES_SHEET}!${r.row}`, {
        outcome: entry.status === 'created' ? 'created' : entry.status === 'valid' ? 'valid' : 'failed',
        note: entry.service_code ? `Mã dịch vụ: ${entry.service_code}` : undefined,
      });
    }

    const failed = services.filter((s) => s.status === 'failed').length;
    return {
      dry_run: dryRun,
      summary: {
        services: {
          total: rows.length,
          valid: rows.length - failed,
          created: services.filter((s) => s.status === 'created').length,
          failed,
        },
      },
      services: withSheetNames(layout, services),
      issues: withSheetNames(layout, issues.issues),
      result_file: await buildResultFile(layout, workbook, results, issues.issues),
    };
  }
}
