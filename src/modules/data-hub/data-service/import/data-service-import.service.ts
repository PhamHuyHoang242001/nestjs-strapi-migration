import { ConflictException, Injectable } from '@nestjs/common';
import * as dayjs from 'dayjs';
import { DataSource } from 'typeorm';
import { DataHubCaller } from '../../common/data-hub-access.service';
import { LogicalTermWriteService } from '../../dictionary/logical-term-write.service';
import { DataHubDataServiceWriteService } from '../data-hub-data-service-write.service';
import { CreateDataServiceDto } from '../dto';
import { locateDtoPath } from './data-service-import-dto-path-locator.util';
import { ImportIssueCollector, ImportIssueWithLevel, validateDto } from './data-service-import-issue-collector.util';
import {
  assertLogicalLinkCounts,
  createImportedLogicalTerms,
  errorText,
} from './data-service-import-logical-terms.util';
import { DataServiceImportReferenceLookupService } from './data-service-import-reference-lookup.service';
import { buildResultWorkbook, RowResult } from './data-service-import-result-workbook.util';
import { buildServiceDrafts } from './data-service-import-service-rows.util';
import { attachTermRows, buildLogicalDrafts } from './data-service-import-term-rows.util';
import { loadImportWorkbook } from './data-service-import-workbook-reader.util';

export interface DataServiceImportResult {
  dry_run: boolean;
  summary: {
    services: { total: number; valid: number; created: number; failed: number };
    term_rows: { total: number; failed: number };
    logical_terms: { total: number; valid: number; created: number; failed: number };
  };
  services: Array<{
    sheet: 'API' | 'SFTP';
    row: number;
    ref: string;
    status: string;
    id?: number;
    service_code?: string;
  }>;
  issues: ImportIssueWithLevel[];
  result_file: { file_name: string; content_base64: string };
}

// Bulk create of data services from the import workbook. Every row is checked first with the same DTO classes
// and lookups as the create APIs; then (unless dry run) each valid service is created through the regular create
// path in its own transaction, so one failing service never leaves partial data or blocks the others. Logical
// terms from LOGICAL_TERM_MOI are created last, mapped to the physical terms just created.
@Injectable()
export class DataServiceImportService {
  // Users with a real import running in this process: a re-submit (double click, proxy timeout) would otherwise
  // create the services that have no source table a second time.
  private readonly running = new Set<number>();

  constructor(
    private readonly dataSource: DataSource,
    private readonly lookup: DataServiceImportReferenceLookupService,
    private readonly writeService: DataHubDataServiceWriteService,
    private readonly logicalWrite: LogicalTermWriteService,
  ) {}

  async import(file: Buffer, dryRun: boolean, caller: DataHubCaller): Promise<DataServiceImportResult> {
    if (dryRun) return this.run(file, true, caller);
    if (this.running.has(caller.id)) throw new ConflictException('IMPORT_IN_PROGRESS: đang có lượt import khác chạy');
    this.running.add(caller.id);
    try {
      return await this.run(file, false, caller);
    } finally {
      this.running.delete(caller.id);
    }
  }

  private async run(file: Buffer, dryRun: boolean, caller: DataHubCaller): Promise<DataServiceImportResult> {
    const { workbook, sheets } = await loadImportWorkbook(file);
    const issues = new ImportIssueCollector();
    const refs = await this.lookup.load(sheets, caller);
    const logical = await buildLogicalDrafts(sheets.LOGICAL, refs, issues);
    const { drafts, duplicateRefs } = buildServiceDrafts(sheets, refs, issues);
    attachTermRows(sheets.TERMS, drafts, duplicateRefs, logical, refs, issues);
    assertLogicalLinkCounts(logical.drafts, drafts, issues);
    for (const d of drafts.values()) {
      d.dto = await validateDto(CreateDataServiceDto, d.plain, issues, (path) => locateDtoPath(d, path));
      d.valid = !issues.hasError(d.sheet, d.row) && d.sheetTermRows.every((r) => !issues.hasError('TERMS', r));
    }
    // A new logical term is created only when some valid service still points at it.
    for (const l of logical.drafts.values()) {
      const users = [...l.usedBy].map((ref) => drafts.get(ref));
      if (users.length === 0) {
        issues.add('LOGICAL', l.row, 'code', 'LOGICAL_TERM_UNUSED', 'Không có dòng physical term nào dùng mã này');
      } else if (!users.some((d) => d?.valid)) {
        issues.add('LOGICAL', l.row, 'code', 'LOGICAL_TERM_UNUSED', 'Các dịch vụ dùng mã này đều đang lỗi');
      }
      l.valid = !issues.hasError('LOGICAL', l.row);
    }

    const results = new Map<string, RowResult>();
    const services: DataServiceImportResult['services'] = [];
    const created = new Map<string, number>();
    for (const [ref, d] of drafts) {
      const entry: DataServiceImportResult['services'][number] = {
        sheet: d.sheet,
        row: d.row,
        ref: d.ref,
        status: d.valid ? 'valid' : 'failed',
      };
      if (d.valid && !dryRun) {
        try {
          const res = await this.writeService.create(d.dto, caller);
          Object.assign(entry, { status: 'created', id: res.id, service_code: res.service_code });
          created.set(ref, res.id);
        } catch (err) {
          entry.status = 'failed';
          issues.add(d.sheet, d.row, undefined, 'CREATE_FAILED', errorText(err));
        }
      }
      services.push(entry);
      const outcome = entry.status === 'created' ? 'created' : entry.status === 'valid' ? 'valid' : 'failed';
      results.set(`${d.sheet}!${d.row}`, {
        outcome,
        note: entry.service_code ? `Mã dịch vụ: ${entry.service_code}` : undefined,
      });
      for (const r of d.sheetTermRows) {
        const own = issues.hasError('TERMS', r);
        results.set(`TERMS!${r}`, {
          outcome: own ? 'failed' : outcome === 'failed' ? 'skipped' : outcome,
          note: !own && outcome === 'failed' ? `Dịch vụ ${d.ref} lỗi nên dòng này không được tạo` : undefined,
        });
      }
    }

    let logicalCreated = 0;
    if (dryRun) {
      logical.drafts.forEach((l) => l.valid && results.set(`LOGICAL!${l.row}`, { outcome: 'valid' }));
    } else {
      logicalCreated = await createImportedLogicalTerms(
        { dataSource: this.dataSource, logicalWrite: this.logicalWrite },
        logical.drafts,
        drafts,
        created,
        caller.id,
        issues,
        results,
      );
    }
    sheets.TERMS.forEach((r) => results.has(`TERMS!${r.row}`) || results.set(`TERMS!${r.row}`, { outcome: 'failed' }));
    sheets.LOGICAL.forEach(
      (r) => results.has(`LOGICAL!${r.row}`) || results.set(`LOGICAL!${r.row}`, { outcome: 'failed' }),
    );

    const buffer = await buildResultWorkbook(workbook, results, issues.issues);
    const serviceCount = sheets.API.length + sheets.SFTP.length;
    const passed = services.filter((s) => s.status !== 'failed').length;
    const logicalValid = [...logical.drafts.values()].filter((l) => l.valid).length;
    return {
      dry_run: dryRun,
      summary: {
        services: {
          total: serviceCount,
          valid: passed,
          created: services.filter((s) => s.status === 'created').length,
          failed: serviceCount - passed,
        },
        term_rows: {
          total: sheets.TERMS.length,
          failed: sheets.TERMS.filter((r) => results.get(`TERMS!${r.row}`)?.outcome !== (dryRun ? 'valid' : 'created'))
            .length,
        },
        logical_terms: {
          total: sheets.LOGICAL.length,
          valid: logicalValid,
          created: logicalCreated,
          failed: sheets.LOGICAL.length - (dryRun ? logicalValid : logicalCreated),
        },
      },
      services,
      issues: issues.issues,
      result_file: {
        file_name: `ket-qua-import-dich-vu_${dayjs().format('DD-MM-YYYY_HHmm')}.xlsx`,
        content_base64: buffer.toString('base64'),
      },
    };
  }
}
