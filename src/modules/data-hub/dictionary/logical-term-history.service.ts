import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { DataHubUserRefService } from '../common/data-hub-user-ref.service';
import { returningRows } from './logical-term-mapping.util';
import { DataHubPageQueryDto, liveSql, toPaging } from '../common/data-hub-query.util';

export type LogicalTermAction = 'CREATE' | 'UPDATE';

// Snapshot written per version: term fields plus the physical columns attached at that moment.
export interface LogicalTermSnapshot {
  code: string;
  short_description: string;
  example_value: string | null;
  physical_terms: Array<{ id: number; code: string; source_table: string }>;
}

interface HistoryRow {
  id: number;
  version_no: number;
  action: string;
  snapshot: unknown;
  changed_by: number;
  created_at: Date;
}

@Injectable()
export class LogicalTermHistoryService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly userRefs: DataHubUserRefService,
  ) {}

  // Current state of a term as a snapshot (physicals ordered by id for stable diffs).
  async buildSnapshot(manager: EntityManager, logicalTermId: number): Promise<LogicalTermSnapshot> {
    const rows: LogicalTermSnapshot[] = await manager.query(
      `SELECT lt.code, lt.short_description, lt.example_value,
              COALESCE((SELECT json_agg(json_build_object('id', p.id, 'code', p.code, 'source_table', st.name) ORDER BY p.id)
                        FROM data_hub_physical_terms p JOIN data_hub_source_tables st ON st.id = p.source_table_id
                        WHERE p.logical_term_id = lt.id AND ${liveSql('p')}), '[]'::json) AS physical_terms
       FROM data_hub_logical_terms lt WHERE lt.id = $1`,
      [logicalTermId],
    );
    return rows[0];
  }

  // UPDATE bumps version_no on the term first; CREATE keeps the initial version_no (1).
  // The history row always carries the same version_no as the term after the call.
  async recordVersion(
    manager: EntityManager,
    logicalTermId: number,
    userId: number,
    action: LogicalTermAction,
  ): Promise<number> {
    let versionNo = 1;
    if (action === 'UPDATE') {
      const result: unknown = await manager.query(
        `UPDATE data_hub_logical_terms SET version_no = version_no + 1, updated_by = $2, updated_at = NOW()
         WHERE id = $1 RETURNING version_no`,
        [logicalTermId, userId],
      );
      versionNo = Number(returningRows<{ version_no: number }>(result)[0].version_no);
    }
    const snapshot = await this.buildSnapshot(manager, logicalTermId);
    await manager.query(
      `INSERT INTO data_hub_logical_term_histories (logical_term_id, version_no, action, snapshot, changed_by)
       VALUES ($1, $2, $3, $4::jsonb, $5)`,
      [logicalTermId, versionNo, action, JSON.stringify(snapshot), userId],
    );
    return versionNo;
  }

  async recordVersions(manager: EntityManager, logicalTermIds: number[], userId: number): Promise<void> {
    for (const id of [...new Set(logicalTermIds)].sort((a, b) => a - b)) {
      await this.recordVersion(manager, id, userId, 'UPDATE');
    }
  }

  async list(logicalTermId: number, q: DataHubPageQueryDto) {
    const exists: Array<{ id: number }> = await this.dataSource.query(
      `SELECT lt.id FROM data_hub_logical_terms lt WHERE lt.id = $1 AND ${liveSql('lt')}`,
      [logicalTermId],
    );
    if (exists.length === 0) throw new NotFoundException('LOGICAL_TERM_NOT_FOUND');
    const { page, limit, offset } = toPaging(q);
    const [{ total }] = await this.dataSource.query<Array<{ total: number }>>(
      `SELECT COUNT(*)::int AS total FROM data_hub_logical_term_histories h
       WHERE h.logical_term_id = $1 AND ${liveSql('h')}`,
      [logicalTermId],
    );
    const rows = await this.dataSource.query<HistoryRow[]>(
      `SELECT h.id, h.version_no, h.action, h.snapshot, h.changed_by, h.created_at
       FROM data_hub_logical_term_histories h
       WHERE h.logical_term_id = $1 AND ${liveSql('h')}
       ORDER BY h.version_no DESC, h.id DESC LIMIT $2 OFFSET $3`,
      [logicalTermId, limit, offset],
    );
    const users = await this.userRefs.resolve(rows.map((r) => r.changed_by));
    return {
      data: rows.map((r) => ({
        id: r.id,
        version_no: r.version_no,
        action: r.action,
        snapshot: r.snapshot,
        changed_by_user: this.userRefs.toRef(users, r.changed_by),
        created_at: r.created_at,
      })),
      meta: { total, page, limit },
    };
  }
}
