import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DataHubUserRefService } from '../common/data-hub-user-ref.service';
import { queryRows } from './data-service-query-rows.util';
import { DataHubPageMeta, DataHubPageQueryDto, liveSql, toPaging } from '../common/data-hub-query.util';

interface HistoryRow {
  id: number;
  version_no: number | null;
  action: string;
  change_note: string | null;
  changed_by: number;
  created_at: Date;
  change_count: number;
}

interface HistoryDetailRow extends Omit<HistoryRow, 'change_count'> {
  changes: unknown;
}

interface VersionListRow {
  id: number;
  version_no: number;
  old_version: number | null;
  state: string;
  changelog_note: string | null;
  submitted_by: number;
  reviewed_by: number | null;
  reviewed_at: Date | null;
  created_at: Date;
}

type TotalRow = { total: number };

// Change log ("Lịch sử phiên bản") and the version list of one data service.
@Injectable()
export class DataHubDataServiceHistoryService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly userRefs: DataHubUserRefService,
  ) {}

  async listHistories(id: number, q: DataHubPageQueryDto): Promise<{ data: unknown[]; meta: DataHubPageMeta }> {
    await this.assertServiceExists(id);
    const { page, limit, offset } = toPaging(q);
    const [countRows, rows] = await Promise.all([
      queryRows<TotalRow>(
        this.dataSource,
        `SELECT COUNT(*)::int AS total FROM data_hub_data_service_histories h
         WHERE h.data_service_id = $1 AND ${liveSql('h')}`,
        [id],
      ),
      queryRows<HistoryRow>(
        this.dataSource,
        `SELECT h.id, h.version_no, h.action, h.change_note, h.changed_by, h.created_at,
                CASE WHEN jsonb_typeof(h.changes) = 'array' THEN jsonb_array_length(h.changes) ELSE 0 END AS change_count
         FROM data_hub_data_service_histories h
         WHERE h.data_service_id = $1 AND ${liveSql('h')}
         ORDER BY h.created_at DESC, h.id DESC LIMIT $2 OFFSET $3`,
        [id, limit, offset],
      ),
    ]);
    const list = rows;
    const users = await this.userRefs.resolve(list.map((r) => r.changed_by));
    const data = list.map((r) => ({
      id: Number(r.id),
      version_no: r.version_no === null ? null : Number(r.version_no),
      action: r.action,
      change_note: r.change_note,
      change_count: Number(r.change_count),
      changed_by_user: this.userRefs.toRef(users, r.changed_by),
      created_at: r.created_at,
    }));
    return { data, meta: { total: Number(countRows[0]?.total ?? 0), page, limit } };
  }

  async historyDetail(id: number, historyId: number) {
    const [row] = await queryRows<HistoryDetailRow>(
      this.dataSource,
      `SELECT h.id, h.version_no, h.action, h.change_note, h.changes, h.changed_by, h.created_at
       FROM data_hub_data_service_histories h
       JOIN data_hub_data_services s ON s.id = h.data_service_id AND ${liveSql('s')}
       WHERE h.id = $1 AND h.data_service_id = $2 AND ${liveSql('h')}`,
      [historyId, id],
    );
    if (!row) throw new NotFoundException('DATA_SERVICE_HISTORY_NOT_FOUND');
    const users = await this.userRefs.resolve([row.changed_by]);
    return {
      id: Number(row.id),
      version_no: row.version_no === null ? null : Number(row.version_no),
      action: row.action,
      change_note: row.change_note,
      changed_by_user: this.userRefs.toRef(users, row.changed_by),
      created_at: row.created_at,
      changes: Array.isArray(row.changes) ? row.changes : [],
    };
  }

  async listVersions(id: number, q: DataHubPageQueryDto): Promise<{ data: unknown[]; meta: DataHubPageMeta }> {
    await this.assertServiceExists(id);
    const { page, limit, offset } = toPaging(q);
    const [countRows, rows] = await Promise.all([
      queryRows<TotalRow>(
        this.dataSource,
        `SELECT COUNT(*)::int AS total FROM data_hub_data_service_versions v
         WHERE v.data_service_id = $1 AND ${liveSql('v')}`,
        [id],
      ),
      queryRows<VersionListRow>(
        this.dataSource,
        `SELECT v.id, v.version_no, v.old_version, v.state, v.changelog_note, v.submitted_by, v.reviewed_by,
                v.reviewed_at, v.created_at
         FROM data_hub_data_service_versions v
         WHERE v.data_service_id = $1 AND ${liveSql('v')}
         ORDER BY v.version_no DESC, v.id DESC LIMIT $2 OFFSET $3`,
        [id, limit, offset],
      ),
    ]);
    const list = rows;
    const users = await this.userRefs.resolve(list.flatMap((r) => [r.submitted_by, r.reviewed_by]));
    const data = list.map((r) => ({
      id: Number(r.id),
      version_no: Number(r.version_no),
      old_version: r.old_version === null ? null : Number(r.old_version),
      state: r.state,
      changelog_note: r.changelog_note,
      submitted_by_user: this.userRefs.toRef(users, r.submitted_by),
      reviewed_by_user: this.userRefs.toRef(users, r.reviewed_by),
      reviewed_at: r.reviewed_at,
      created_at: r.created_at,
    }));
    return { data, meta: { total: Number(countRows[0]?.total ?? 0), page, limit } };
  }

  private async assertServiceExists(id: number): Promise<void> {
    const rows = await queryRows<{ ok: number }>(
      this.dataSource,
      `SELECT 1 AS ok FROM data_hub_data_services s WHERE s.id = $1 AND ${liveSql('s')}`,
      [id],
    );
    if (rows.length === 0) throw new NotFoundException('DATA_SERVICE_NOT_FOUND');
  }
}
