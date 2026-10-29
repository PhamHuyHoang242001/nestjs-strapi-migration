import { HttpException, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { liveSql } from '../../common/data-hub-query.util';
import { LogicalTermWriteService } from '../../dictionary/logical-term-write.service';
import { ImportIssueCollector } from './data-service-import-issue-collector.util';
import { lower } from './data-service-import-reference-lookup.service';
import { RowResult } from './data-service-import-result-workbook.util';
import { ServiceDraft } from './data-service-import-service-rows.util';
import { LogicalDraft } from './data-service-import-term-rows.util';

// Same cap as LogicalTermBodyDto.physical_term_ids.
export const MAX_PHYSICALS_PER_LOGICAL = 1000;

const logger = new Logger('DataServiceImport');

// Message of a failed create: the API's own message for HTTP errors; anything else is logged and hidden.
export const errorText = (err: unknown): string => {
  if (err instanceof HttpException) {
    const body = err.getResponse() as { message?: string | string[] } | string;
    const msg = typeof body === 'string' ? body : body.message;
    return Array.isArray(msg) ? msg.join('; ') : String(msg ?? err.message);
  }
  logger.error(err instanceof Error ? (err.stack ?? err.message) : JSON.stringify(err));
  return 'INTERNAL_ERROR: lỗi hệ thống khi tạo';
};

// A new logical term would get more physicals than its API accepts: the logical row and every term row pointing at
// it fail before anything is written (the services are then not created with those terms left unmapped).
export function assertLogicalLinkCounts(
  logical: Map<string, LogicalDraft>,
  drafts: Map<string, ServiceDraft>,
  issues: ImportIssueCollector,
): void {
  for (const l of logical.values()) {
    const links = [...drafts.values()].flatMap((d) =>
      d.newLogicalLinks.filter((x) => lower(x.logicalCode) === lower(l.code)),
    );
    if (links.length <= MAX_PHYSICALS_PER_LOGICAL) continue;
    issues.add(
      'LOGICAL',
      l.row,
      'code',
      'TOO_MANY_PHYSICALS',
      `Được ${links.length} physical term dùng, tối đa ${MAX_PHYSICALS_PER_LOGICAL}`,
    );
    links.forEach((x) =>
      issues.add(
        'TERMS',
        x.row,
        'logical_code',
        'LOGICAL_TERM_INVALID',
        `Logical ${l.code} vượt quá số physical cho phép`,
      ),
    );
  }
}

// Creates the new logical terms after the services, each mapped to the physicals just created for it (found by
// service, table name and code). Services are already committed here: when a logical cannot be created, the term
// rows that should have been mapped get a warning so the gap is visible instead of a silent "Thành công".
export async function createImportedLogicalTerms(
  deps: { dataSource: DataSource; logicalWrite: LogicalTermWriteService },
  logical: Map<string, LogicalDraft>,
  drafts: Map<string, ServiceDraft>,
  created: Map<string, number>,
  userId: number,
  issues: ImportIssueCollector,
  results: Map<string, RowResult>,
): Promise<number> {
  const physicalsOf = new Map<number, Array<{ id: number; table_name: string; code: string }>>();
  const loadPhysicals = async (serviceId: number) => {
    if (!physicalsOf.has(serviceId)) {
      physicalsOf.set(
        serviceId,
        await deps.dataSource.query(
          `SELECT p.id, st.name AS table_name, p.code FROM data_hub_physical_terms p
           JOIN data_hub_source_tables st ON st.id = p.source_table_id
           WHERE p.data_service_id = $1 AND ${liveSql('p')}`,
          [serviceId],
        ),
      );
    }
    return physicalsOf.get(serviceId);
  };

  let count = 0;
  for (const l of logical.values()) {
    if (!l.valid) continue;
    const physicalIds: number[] = [];
    const termRows: number[] = [];
    for (const ref of l.usedBy) {
      const serviceId = created.get(ref);
      if (serviceId === undefined) continue;
      const rows = await loadPhysicals(serviceId);
      for (const link of drafts.get(ref)?.newLogicalLinks ?? []) {
        if (lower(link.logicalCode) !== lower(l.code)) continue;
        const hit = rows.find(
          (p) => lower(p.table_name) === lower(link.tableName) && lower(p.code) === lower(link.termCode),
        );
        if (hit) {
          physicalIds.push(Number(hit.id));
          termRows.push(link.row);
        }
      }
    }
    if (physicalIds.length === 0) {
      results.set(`LOGICAL!${l.row}`, { outcome: 'skipped', note: 'Không còn physical term nào được tạo cho mã này' });
      continue;
    }
    try {
      const res = await deps.logicalWrite.create(
        {
          code: l.code,
          short_description: l.short_description,
          example_value: l.example_value,
          physical_term_ids: physicalIds,
        },
        userId,
      );
      results.set(`LOGICAL!${l.row}`, {
        outcome: 'created',
        note: `Đã tạo logical #${res.id}, map ${physicalIds.length} physical`,
      });
      count++;
    } catch (err) {
      const message = errorText(err);
      issues.add('LOGICAL', l.row, undefined, 'CREATE_FAILED', message);
      results.set(`LOGICAL!${l.row}`, { outcome: 'failed' });
      termRows.forEach((r) =>
        issues.add(
          'TERMS',
          r,
          'logical_code',
          'LOGICAL_NOT_MAPPED',
          `Physical đã tạo nhưng chưa map được logical ${l.code} (${message}); hãy map lại trên màn hình logical term`,
          true,
        ),
      );
    }
  }
  return count;
}
