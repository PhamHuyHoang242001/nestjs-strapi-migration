import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DataHubAccessService, DataHubCaller } from '../common/data-hub-access.service';
import { DH_PERMISSIONS } from '../common/data-hub-permission-codes';
import { DataHubDataServiceWriteService } from '../data-service/data-hub-data-service-write.service';
import { DataServiceSnapshotService } from '../data-service/data-service-snapshot.service';
import { DetailSourceTable } from '../data-service/data-service-source-tables-detail.util';
import { DataServiceSourceTableInputDto, UpdateDataServiceDto } from '../data-service/dto';
import { checkRequired, errorText, ImportRunGuard, lower, uniqueLower } from './import-helpers.util';
import {
  MAX_TABLES_PER_SERVICE,
  MAX_TERMS_PER_TABLE,
  NO_VALUES,
  SOURCE_TABLE_IMPORT_LAYOUT,
  TERMS_SHEET,
  YES_VALUES,
} from './import-layouts';
import { SourceTableImportLookupService, SourceTableService } from './import-lookups.service';
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

// Terms to add to one table: a table the service already uses (`own`) or a new one.
export interface TableGroup {
  name: string;
  description: string;
  own?: DetailSourceTable;
  terms: Array<Record<string, unknown>>;
  termRows: number[];
  firstRow: number;
}

export interface ServiceGroup {
  service?: SourceTableService;
  rows: ImportRow[];
  tables: Map<string, TableGroup>;
}

export interface PlanContext {
  rows: ImportRow[];
  issues: ImportIssueCollector;
  services: Map<string, SourceTableService>;
  logicals: Map<string, number>;
  // Lower-case names of live source tables in the system.
  tableNames: Set<string>;
  canUpdate: boolean;
  // Departments the caller may update services in; null = every department.
  updatableDepartments: Set<number> | null;
}

const err = (ctx: PlanContext, r: ImportRow, key: string | undefined, code: string, message: string, warn = false) =>
  ctx.issues.add(TERMS_SHEET, r.row, key, code, message, warn);

// Property of the table body -> column of the sheet.
const TERM_COLUMN: Record<string, string> = { logical_term_id: 'logical_code' };

// Groups the rows by service then by table and checks everything that needs no write: the service and its
// department, table names, codes, logical terms, and the size caps. A table the service already uses takes the
// new terms; any other name must be free in the whole system.
export async function planGroups(ctx: PlanContext): Promise<Map<string, ServiceGroup>> {
  // Services using each table name in the file, to catch one new name on two services.
  const servicesOfName = new Map<string, Set<string>>();
  for (const r of ctx.rows) {
    const set = servicesOfName.get(lower(r.values.table_name)) ?? new Set<string>();
    set.add(lower(r.values.service_code));
    servicesOfName.set(lower(r.values.table_name), set);
  }

  const groups = new Map<string, ServiceGroup>();
  for (const r of ctx.rows) {
    const v = r.values;
    checkRequired(SOURCE_TABLE_IMPORT_LAYOUT, TERMS_SHEET, r, ctx.issues);
    const key = lower(v.service_code);
    const group = groups.get(key) ?? {
      service: ctx.services.get(key),
      rows: [],
      tables: new Map<string, TableGroup>(),
    };
    groups.set(key, group);
    group.rows.push(r);
    const { service } = group;
    if (!ctx.canUpdate) {
      err(ctx, r, undefined, 'PERMISSION_DENIED', 'Bạn không có quyền cập nhật dịch vụ dữ liệu');
    } else if (v.service_code && !service) {
      err(ctx, r, 'service_code', 'SERVICE_NOT_FOUND', `Không có dịch vụ "${v.service_code}"`);
    } else if (service && ctx.updatableDepartments && !ctx.updatableDepartments.has(service.departmentId ?? -1)) {
      err(ctx, r, 'service_code', 'DEPARTMENT_FORBIDDEN', 'Bạn không thuộc đơn vị quản lý dịch vụ này');
    }

    const nameKey = lower(v.table_name);
    const own = service?.tables.find((t) => lower(t.name) === nameKey);
    if (v.table_name && service && !own) {
      if (ctx.tableNames.has(nameKey)) {
        err(
          ctx,
          r,
          'table_name',
          'SOURCE_TABLE_NAME_EXISTS',
          'Tên bảng đã có trong hệ thống (không phải bảng của dịch vụ này)',
        );
      } else if ((servicesOfName.get(nameKey)?.size ?? 0) > 1) {
        err(ctx, r, 'table_name', 'SOURCE_TABLE_NAME_DUPLICATE', 'Tên bảng được dùng cho nhiều dịch vụ trong file');
      }
    }

    let isRequired: boolean | string = false;
    if (v.is_required !== '') {
      const t = lower(v.is_required);
      isRequired = YES_VALUES.has(t) ? true : NO_VALUES.has(t) ? false : v.is_required;
    }
    let logicalId: number | null = null;
    if (v.logical_code) {
      logicalId = ctx.logicals.get(lower(v.logical_code)) ?? null;
      if (logicalId === null) {
        err(
          ctx,
          r,
          'logical_code',
          'LOGICAL_TERM_NOT_FOUND',
          `Thuật ngữ chuẩn hoá "${v.logical_code}" chưa có trong hệ thống`,
        );
      }
    }
    if (!service || !v.table_name) continue;

    let table = group.tables.get(nameKey);
    if (!table) {
      table = {
        name: own?.name ?? v.table_name,
        description: v.table_description,
        own,
        terms: [],
        termRows: [],
        firstRow: r.row,
      };
      group.tables.set(nameKey, table);
    } else if (v.table_description && v.table_description !== table.description) {
      err(
        ctx,
        r,
        'table_description',
        'TABLE_DESCRIPTION_IGNORED',
        'Khác mô tả ở dòng đầu của bảng; hệ thống dùng mô tả ở dòng đầu',
        true,
      );
    }
    const codeKey = lower(v.code);
    const taken = table.own?.terms.some((t) => lower(t.code) === codeKey);
    if (v.code && taken) {
      err(ctx, r, 'code', 'PHYSICAL_CODE_EXISTS', `Mã "${v.code}" đã có trong bảng ${table.name} của dịch vụ`);
    } else if (v.code && table.terms.some((t) => lower(t.code as string) === codeKey)) {
      err(ctx, r, 'code', 'PHYSICAL_CODE_DUPLICATE', `Mã "${v.code}" bị lặp trong bảng ${table.name}`);
    } else {
      table.terms.push({
        code: v.code,
        technical_description: v.technical_description,
        data_type: v.data_type,
        is_required: isRequired,
        example_value: v.example_value || undefined,
        logical_term_id: logicalId,
      });
      table.termRows.push(r.row);
    }
  }

  for (const group of groups.values()) await validateGroup(ctx, group);
  return groups;
}

// DTO rules of a table body (the form's own) on the terms being added, plus the size caps of the whole service.
async function validateGroup(ctx: PlanContext, group: ServiceGroup): Promise<void> {
  if (!group.service) return;
  for (const t of group.tables.values()) {
    await validateDto(
      DataServiceSourceTableInputDto,
      { name: t.name, description: t.own ? undefined : t.description || undefined, terms: t.terms },
      ctx.issues,
      (path) => {
        const parts = path.split('.');
        if (parts[0] === 'terms' && parts.length > 2) {
          const row = t.termRows[Number(parts[1])];
          if (row !== undefined) return { sheet: TERMS_SHEET, row, key: TERM_COLUMN[parts[2]] ?? parts[2] };
        }
        const key = parts[0] === 'name' ? 'table_name' : parts[0] === 'description' ? 'table_description' : undefined;
        return { sheet: TERMS_SHEET, row: t.firstRow, key };
      },
    );
    if ((t.own?.terms.length ?? 0) + t.terms.length > MAX_TERMS_PER_TABLE) {
      ctx.issues.add(
        TERMS_SHEET,
        t.firstRow,
        'table_name',
        'TOO_MANY_TERMS',
        `Mỗi bảng tối đa ${MAX_TERMS_PER_TABLE} term`,
      );
    }
  }
  const fresh = [...group.tables.values()].filter((t) => !t.own).length;
  if (group.service.tables.length + fresh > MAX_TABLES_PER_SERVICE) {
    group.rows.forEach((r) =>
      ctx.issues.add(
        TERMS_SHEET,
        r.row,
        'table_name',
        'TOO_MANY_TABLES',
        `Mỗi dịch vụ tối đa ${MAX_TABLES_PER_SERVICE} bảng`,
      ),
    );
  }
}

export const SOURCE_TABLE_IMPORT_NOTE = 'Import bảng nguồn & thuật ngữ nghiệp vụ';

// Table input that keeps an existing table exactly as stored (ids, fields and mappings).
export const keepTable = (t: DetailSourceTable): DataServiceSourceTableInputDto =>
  ({
    id: t.id,
    name: t.name,
    description: t.description,
    terms: t.terms.map((x) => ({
      id: x.id,
      code: x.code,
      technical_description: x.technical_description,
      // Terms created before the field existed keep it empty.
      data_type: x.data_type,
      is_required: x.is_required,
      example_value: x.example_value,
      // Explicit, so the save keeps each term's current mapping.
      logical_term_id: x.logical_term?.id ?? null,
    })),
  }) as DataServiceSourceTableInputDto;

// The full PUT /data-services/:id body that re-saves the active version of a service as stored, with the given
// source tables. The regular update path replaces the whole state (terms left out are deleted), so the body is
// rebuilt from what is stored (it was validated when saved); sending it through the normal update keeps the diff,
// history, permission and version logic in one place. Consumers are carried over as stored, so a service with
// none (allowed by the imports) stays updatable here; the UI PUT body keeps its 1..20 rule.
export async function buildUpdateBody(
  dataSource: DataSource,
  snapshots: DataServiceSnapshotService,
  versionId: number,
  sourceTables: DataServiceSourceTableInputDto[],
): Promise<UpdateDataServiceDto> {
  const { source } = await snapshots.loadVersion(dataSource.manager, versionId);
  const body = {
    name: source.name,
    short_description: source.short_description,
    purpose: source.purpose ?? undefined,
    usage_guide_html: source.usage_guide_html,
    request_unit_id: source.request_unit_id,
    division_id: source.division_id,
    department_id: source.department_id,
    consumer_ids: source.consumer_ids,
    requester_user_ids: source.requester_user_ids,
    it_supporter_user_ids: source.it_supporter_user_ids,
    service_owner_user_ids: source.service_owner_user_ids,
    api_spec: source.api_spec ?? undefined,
    sftp_spec: source.sftp_spec ?? undefined,
    changelog_note: SOURCE_TABLE_IMPORT_NOTE,
    source_tables: sourceTables,
  };
  return body as unknown as UpdateDataServiceDto;
}

interface Entry {
  sheet: string;
  row: number;
  ref: string;
  // valid | updated | failed | skipped
  status: string;
  id?: number;
  code?: string;
  version_no?: number;
}

export interface SourceTableImportResult {
  dry_run: boolean;
  summary: {
    rows: { total: number; valid: number; updated: number; failed: number };
    services: { total: number; valid: number; updated: number; failed: number };
  };
  source_tables: Entry[];
  issues: ImportIssueWithLevel[];
  result_file: { file_name: string; content_base64: string };
}

// Adds source tables and physical terms to existing services: each service gets ONE new version through the
// regular update (same validation, permission, diff and history as PUT /data-services/:id), keeping everything it
// already has. A service is written only when all its rows are valid.
@Injectable()
export class SourceTableImportService {
  private readonly runGuard = new ImportRunGuard();

  constructor(
    private readonly dataSource: DataSource,
    private readonly lookup: SourceTableImportLookupService,
    private readonly access: DataHubAccessService,
    private readonly snapshots: DataServiceSnapshotService,
    private readonly writeService: DataHubDataServiceWriteService,
  ) {}

  import(file: Buffer, dryRun: boolean, caller: DataHubCaller) {
    return this.runGuard.run(caller.id, dryRun, () => this.run(file, dryRun, caller));
  }

  private async run(file: Buffer, dryRun: boolean, caller: DataHubCaller): Promise<SourceTableImportResult> {
    const { workbook, sheets } = await loadImportWorkbook(file, SOURCE_TABLE_IMPORT_LAYOUT);
    const rows = sheets[TERMS_SHEET];
    const issues = new ImportIssueCollector(SOURCE_TABLE_IMPORT_LAYOUT);
    const [services, logicals, tableNames, updatable, canUpdate] = await Promise.all([
      this.lookup.services(uniqueLower(rows.map((r) => r.values.service_code))),
      this.lookup.logicals(uniqueLower(rows.map((r) => r.values.logical_code))),
      this.lookup.tableNames(uniqueLower(rows.map((r) => r.values.table_name))),
      this.access.writableDepartmentIds(caller, 'update'),
      this.access.hasCode(caller, DH_PERMISSIONS.DATA_SERVICE_UPDATE),
    ]);
    const groups = await planGroups({
      rows,
      issues,
      services,
      logicals,
      tableNames,
      canUpdate,
      updatableDepartments: updatable === null ? null : new Set(updatable),
    });

    const results = new Map<string, RowResult>();
    const entries: Entry[] = [];
    for (const group of groups.values()) {
      const clean = !group.rows.some((r) => issues.hasError(TERMS_SHEET, r.row));
      let status = clean ? 'valid' : 'failed';
      let versionNo: number | undefined;
      if (clean && !dryRun && group.service) {
        try {
          const res = await this.writeService.update(
            group.service.id,
            await buildUpdateBody(
              this.dataSource,
              this.snapshots,
              group.service.activeVersionId,
              this.mergedTables(group),
            ),
            caller,
          );
          status = 'updated';
          versionNo = res.version_no;
        } catch (err) {
          status = 'failed';
          issues.add(TERMS_SHEET, group.rows[0].row, undefined, 'UPDATE_FAILED', errorText(err));
        }
      }
      for (const r of group.rows) {
        // A row that is fine itself but whose service was not written.
        const skipped = status === 'failed' && !issues.hasError(TERMS_SHEET, r.row);
        results.set(`${TERMS_SHEET}!${r.row}`, {
          outcome: skipped ? 'skipped' : status === 'updated' ? 'created' : status === 'valid' ? 'valid' : 'failed',
          note: skipped
            ? 'Dịch vụ không được cập nhật vì có dòng lỗi'
            : versionNo
              ? `Dịch vụ ${group.service?.code} lên phiên bản v${versionNo}`
              : undefined,
        });
        entries.push({
          sheet: TERMS_SHEET,
          row: r.row,
          ref: r.values.service_code,
          status: skipped ? 'skipped' : status,
          id: group.service?.id,
          code: group.service?.code,
          version_no: versionNo,
        });
      }
    }

    const count = (list: Array<{ status: string }>, ...s: string[]) => list.filter((e) => s.includes(e.status)).length;
    const serviceStatus = [...groups.values()].map((g) => entries.find((e) => e.row === g.rows[0].row));
    return {
      dry_run: dryRun,
      summary: {
        rows: {
          total: entries.length,
          valid: count(entries, 'valid', 'updated'),
          updated: count(entries, 'updated'),
          failed: count(entries, 'failed', 'skipped'),
        },
        services: {
          total: serviceStatus.length,
          valid: count(serviceStatus, 'valid', 'updated'),
          updated: count(serviceStatus, 'updated'),
          failed: count(serviceStatus, 'failed', 'skipped'),
        },
      },
      source_tables: withSheetNames(SOURCE_TABLE_IMPORT_LAYOUT, entries),
      issues: withSheetNames(SOURCE_TABLE_IMPORT_LAYOUT, issues.issues),
      result_file: await buildResultFile(SOURCE_TABLE_IMPORT_LAYOUT, workbook, results, issues.issues),
    };
  }

  // Existing tables as stored (appended terms last in their table) followed by the new tables.
  private mergedTables(group: ServiceGroup): DataServiceSourceTableInputDto[] {
    const service = group.service;
    const kept = service.tables.map((t) => {
      const added = group.tables.get(t.name.toLowerCase());
      const body = keepTable(t);
      return added ? { ...body, terms: [...body.terms, ...(added.terms as unknown as typeof body.terms)] } : body;
    });
    const fresh = [...group.tables.values()]
      .filter((t) => !t.own)
      .map((t) => ({ name: t.name, description: t.description || undefined, terms: t.terms }));
    return [...kept, ...fresh] as unknown as DataServiceSourceTableInputDto[];
  }
}
