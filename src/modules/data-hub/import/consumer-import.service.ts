import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DataHubAccessService, DataHubCaller } from '../common/data-hub-access.service';
import { DH_PERMISSIONS } from '../common/data-hub-permission-codes';
import { liveSql } from '../common/data-hub-query.util';
import { DataHubConsumerWriteService } from '../consumer/data-hub-consumer-write.service';
import { CreateConsumerDto } from '../consumer/dto';
import {
  checkRequired,
  ImportRunGuard,
  lookupMany,
  nameMap,
  resolveUser,
  uniqueLower,
  userMap,
} from './import-helpers.util';
import { CONSUMER_IMPORT_LAYOUT } from './import-layouts';
import {
  checkRowRight,
  inFileCounts,
  loadUpsertRights,
  rowNote,
  rowOutcome,
  summarize,
  UpsertEntry,
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
  splitList,
  validateDto,
  withSheetNames,
} from './import-workbook.util';

const SHEET = 'CONSUMERS';
// Property of the create body -> column of the sheet.
const COLUMN_OF: Record<string, string> = {
  owner_unit_id: 'owner_unit',
  so_app_user_ids: 'so_apps',
  system_id: 'system',
};

// Name-matched references of a row: column key -> error code prefix and label in messages.
const BY_NAME = {
  system: { code: 'SYSTEM', label: 'Hệ thống' },
  owner_unit: { code: 'OWNER_UNIT', label: 'Đơn vị chủ quản' },
} as const;

// Hệ thống / Đơn vị chủ quản by name; unknown or ambiguous names are reported. Dịch vụ hệ thống is free text.
function lookupByName(
  r: ImportRow,
  key: keyof typeof BY_NAME,
  ids: Map<string, number | null>,
  issues: ImportIssueCollector,
): number | undefined {
  const name = r.values[key];
  if (name === '') return undefined;
  const { code, label } = BY_NAME[key];
  const id = ids.get(name.toLowerCase());
  if (id === undefined) {
    issues.add(SHEET, r.row, key, `${code}_NOT_FOUND`, `${label} "${name}" không tồn tại`);
  } else if (id === null) {
    issues.add(SHEET, r.row, key, `${code}_AMBIGUOUS`, `Có nhiều ${label.toLowerCase()} tên "${name}"`);
  }
  return id ?? undefined;
}

export interface ConsumerImportResult {
  dry_run: boolean;
  summary: { consumers: UpsertSummary };
  consumers: UpsertEntry[];
  issues: ImportIssueWithLevel[];
  result_file: { file_name: string; content_base64: string };
}

// Bulk create / update of App thụ hưởng by code. Each row is checked with CreateConsumerDto (the create API's own
// rules) and the same lookups (owner unit and system by name, SO APP by email). A code that already exists updates
// that app with the row's values (empty optional cells clear the field, status is kept); a new code creates one.
// Each valid row is written through the consumer write service in its own transaction.
@Injectable()
export class ConsumerImportService {
  private readonly runGuard = new ImportRunGuard();

  constructor(
    private readonly dataSource: DataSource,
    private readonly writeService: DataHubConsumerWriteService,
    private readonly access: DataHubAccessService,
  ) {}

  import(file: Buffer, dryRun: boolean, caller: DataHubCaller): Promise<ConsumerImportResult> {
    return this.runGuard.run(caller.id, dryRun, () => this.run(file, dryRun, caller));
  }

  private async run(file: Buffer, dryRun: boolean, caller: DataHubCaller): Promise<ConsumerImportResult> {
    const { workbook, sheets } = await loadImportWorkbook(file, CONSUMER_IMPORT_LAYOUT);
    const rows = sheets[SHEET];
    const issues = new ImportIssueCollector(CONSUMER_IMPORT_LAYOUT);
    const upper = (code: string) => code.toUpperCase();
    const [ownerUnits, users, existing, systems, rights] = await Promise.all([
      nameMap(this.dataSource, 'data_hub_owner_units', uniqueLower(rows.map((r) => r.values.owner_unit))),
      userMap(this.dataSource, uniqueLower(rows.flatMap((r) => splitList(r.values.so_apps)))),
      this.existingIds(rows.map((r) => upper(r.values.code))),
      nameMap(this.dataSource, 'data_hub_systems', uniqueLower(rows.map((r) => r.values.system))),
      loadUpsertRights(this.access, caller, {
        create: DH_PERMISSIONS.CONSUMER_CREATE,
        update: DH_PERMISSIONS.CONSUMER_UPDATE,
      }),
    ]);
    const inFile = inFileCounts(
      rows.map((r) => r.values.code),
      upper,
    );

    const results = new Map<string, RowResult>();
    const entries: UpsertEntry[] = [];
    for (const r of rows) {
      const v = r.values;
      const existingId = v.code ? existing.get(upper(v.code)) : undefined;
      const action = existingId === undefined ? 'create' : 'update';
      checkRequired(CONSUMER_IMPORT_LAYOUT, SHEET, r, issues);
      checkRowRight(rights, action, { sheet: SHEET, row: r.row, key: 'code' }, 'app thụ hưởng', issues);
      if (v.code && (inFile.get(upper(v.code)) ?? 0) > 1) {
        issues.add(SHEET, r.row, 'code', 'DUPLICATE_IN_FILE', `Mã "${v.code}" khai nhiều lần`);
      }
      const plain = {
        code: v.code,
        name: v.name,
        category: v.category.toUpperCase(),
        owner_unit_id: lookupByName(r, 'owner_unit', ownerUnits, issues),
        short_description: v.short_description,
        so_app_user_ids: lookupMany(SHEET, r, 'so_apps', resolveUser(users), issues),
        system_id: lookupByName(r, 'system', systems, issues),
        system_service: v.system_service,
      };
      const dto = await validateDto(CreateConsumerDto, plain, issues, (path) => ({
        sheet: SHEET,
        row: r.row,
        key: COLUMN_OF[path] ?? path,
      }));
      const entry: UpsertEntry = {
        sheet: SHEET,
        row: r.row,
        ref: v.code,
        action,
        status: issues.hasError(SHEET, r.row) ? 'failed' : 'valid',
      };
      if (entry.status === 'valid' && !dryRun) {
        await writeRow(entry, issues, async () =>
          existingId === undefined
            ? this.writeService.create(dto, caller.id)
            : { ...(await this.writeService.update(existingId, dto, caller.id)), code: dto.code },
        );
      }
      entries.push(entry);
      results.set(`${SHEET}!${r.row}`, { outcome: rowOutcome(entry.status), note: rowNote(entry, 'app') });
    }

    return {
      dry_run: dryRun,
      summary: { consumers: summarize(entries) },
      consumers: withSheetNames(CONSUMER_IMPORT_LAYOUT, entries),
      issues: withSheetNames(CONSUMER_IMPORT_LAYOUT, issues.issues),
      result_file: await buildResultFile(CONSUMER_IMPORT_LAYOUT, workbook, results, issues.issues),
    };
  }

  // Ids of live consumers by upper-case code, among the given codes.
  private async existingIds(codes: string[]): Promise<Map<string, number>> {
    const wanted = [...new Set(codes.filter(Boolean))];
    if (wanted.length === 0) return new Map();
    const rows: Array<{ id: number; code: string }> = await this.dataSource.query(
      `SELECT c.id, c.code FROM data_hub_consumers c WHERE UPPER(c.code) = ANY($1) AND ${liveSql('c')}`,
      [wanted],
    );
    return new Map(rows.map((r) => [r.code.toUpperCase(), Number(r.id)]));
  }
}
