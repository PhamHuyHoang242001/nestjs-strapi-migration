import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DataHubAccessService, DataHubCaller } from '../common/data-hub-access.service';
import { DH_PERMISSIONS } from '../common/data-hub-permission-codes';
import { liveSql } from '../common/data-hub-query.util';
import { termOfActiveServiceSql } from '../common/source-table-groups.util';
import { LogicalTermWriteService } from '../dictionary/logical-term-write.service';
import { LogicalTermImportRowDto } from './import-dto';
import { checkRequired, ImportRunGuard } from './import-helpers.util';
import { LOGICAL_TERM_IMPORT_LAYOUT } from './import-layouts';
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
  loadImportWorkbook,
  RowResult,
  validateDto,
  withSheetNames,
} from './import-workbook.util';

const SHEET = 'TERMS';

export interface LogicalTermImportResult {
  dry_run: boolean;
  summary: { logical_terms: UpsertSummary };
  logical_terms: UpsertEntry[];
  issues: ImportIssueWithLevel[];
  result_file: { file_name: string; content_base64: string };
}

// Bulk create / update of logical terms by code (case-insensitive). A new code creates a term with no physical
// terms (allowed only here; the UI create/edit still needs one); an existing code updates its description and
// example and keeps the physical terms mapped to it. Each row is validated with the create body's rules and
// written in its own transaction.
@Injectable()
export class LogicalTermImportService {
  private readonly runGuard = new ImportRunGuard();

  constructor(
    private readonly dataSource: DataSource,
    private readonly writeService: LogicalTermWriteService,
    private readonly access: DataHubAccessService,
  ) {}

  import(file: Buffer, dryRun: boolean, caller: DataHubCaller): Promise<LogicalTermImportResult> {
    return this.runGuard.run(caller.id, dryRun, () => this.run(file, dryRun, caller));
  }

  private async run(file: Buffer, dryRun: boolean, caller: DataHubCaller): Promise<LogicalTermImportResult> {
    const { workbook, sheets } = await loadImportWorkbook(file, LOGICAL_TERM_IMPORT_LAYOUT);
    const rows = sheets[SHEET];
    const issues = new ImportIssueCollector(LOGICAL_TERM_IMPORT_LAYOUT);
    const key = (code: string) => code.toLowerCase();
    const [existing, rights] = await Promise.all([
      this.existingIds(rows.map((r) => r.values.code)),
      loadUpsertRights(this.access, caller, {
        create: DH_PERMISSIONS.LOGICAL_TERM_CREATE,
        update: DH_PERMISSIONS.LOGICAL_TERM_UPDATE,
      }),
    ]);
    const inFile = inFileCounts(
      rows.map((r) => r.values.code),
      key,
    );

    const results = new Map<string, RowResult>();
    const entries: UpsertEntry[] = [];
    for (const r of rows) {
      const v = r.values;
      const existingId = v.code ? existing.get(key(v.code)) : undefined;
      const action = existingId === undefined ? 'create' : 'update';
      checkRequired(LOGICAL_TERM_IMPORT_LAYOUT, SHEET, r, issues);
      checkRowRight(rights, action, { sheet: SHEET, row: r.row, key: 'code' }, 'thuật ngữ chuẩn hoá', issues);
      if (v.code && (inFile.get(key(v.code)) ?? 0) > 1) {
        issues.add(SHEET, r.row, 'code', 'DUPLICATE_IN_FILE', `Mã "${v.code}" khai nhiều lần`);
      }
      // An empty example clears it on update (the row is the term's full new state).
      const dto = await validateDto(
        LogicalTermImportRowDto,
        { code: v.code, short_description: v.short_description, example_value: v.example_value || null },
        issues,
        (path) => ({ sheet: SHEET, row: r.row, key: path }),
      );
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
            ? this.writeService.create({ ...dto, physical_term_ids: [] }, caller.id)
            : this.writeService.update(
                existingId,
                { ...dto, physical_term_ids: await this.mappedPhysicalIds(existingId) },
                caller.id,
              ),
        );
      }
      entries.push(entry);
      results.set(`${SHEET}!${r.row}`, { outcome: rowOutcome(entry.status), note: rowNote(entry, 'thuật ngữ') });
    }
    return {
      dry_run: dryRun,
      summary: { logical_terms: summarize(entries) },
      logical_terms: withSheetNames(LOGICAL_TERM_IMPORT_LAYOUT, entries),
      issues: withSheetNames(LOGICAL_TERM_IMPORT_LAYOUT, issues.issues),
      result_file: await buildResultFile(LOGICAL_TERM_IMPORT_LAYOUT, workbook, results, issues.issues),
    };
  }

  // Ids of live logical terms by lower-case code, among the given codes.
  private async existingIds(codes: string[]): Promise<Map<string, number>> {
    const wanted = [...new Set(codes.filter(Boolean).map((c) => c.toLowerCase()))];
    if (wanted.length === 0) return new Map();
    const rows: Array<{ id: number; code: string }> = await this.dataSource.query(
      `SELECT t.id, t.code FROM data_hub_logical_terms t WHERE LOWER(t.code) = ANY($1) AND ${liveSql('t')}`,
      [wanted],
    );
    return new Map(rows.map((r) => [r.code.toLowerCase(), Number(r.id)]));
  }

  // Physical terms the edit form shows as mapped to the term (terms of active services). Passing them back keeps
  // the mapping as is; mappings of inactive services' terms are never touched by an update.
  private async mappedPhysicalIds(logicalTermId: number): Promise<number[]> {
    const rows: Array<{ id: number }> = await this.dataSource.query(
      `SELECT p.id FROM data_hub_physical_terms p WHERE p.logical_term_id = $1 AND ${termOfActiveServiceSql('p')}`,
      [logicalTermId],
    );
    return rows.map((r) => Number(r.id));
  }
}
