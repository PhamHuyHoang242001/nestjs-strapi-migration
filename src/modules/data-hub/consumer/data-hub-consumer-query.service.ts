import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DataHubPageQueryDto, liveSql, toPaging } from '../common/data-hub-query.util';
import { DataHubUserRef, DataHubUserRefService } from '../common/data-hub-user-ref.service';
import { DataHubConsumerCountsService } from './data-hub-consumer-counts.service';
import { sqlRows } from './consumer-sql.util';
import { loadSoAppUserIds } from './consumer-so-apps.util';
import { CONSUMER_ITEM_COLUMNS, CONSUMER_ITEM_JOINS, ConsumerListRow, OrgRef } from './consumer-item-sql.util';
import { ConsumerListFilter, buildConsumerWhere } from './consumer-list-filter.util';

const org = (id: number | null, code: string | null, name: string | null): OrgRef | null =>
  id === null || id === undefined ? null : { id: Number(id), code: code ?? '', name: name ?? '' };

interface ConsumerDetailRow extends ConsumerListRow {
  version_no: number;
  created_by: number;
  updated_by: number | null;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class DataHubConsumerQueryService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly userRefs: DataHubUserRefService,
    private readonly counts: DataHubConsumerCountsService,
  ) {}

  async list(filter: ConsumerListFilter & { page?: number; limit?: number }) {
    const { page, limit, offset } = toPaging(filter);
    const { where, params } = buildConsumerWhere(filter);

    const [countRow] = await sqlRows<{ total: number }>(
      this.dataSource,
      `SELECT COUNT(*)::int AS total FROM data_hub_consumers c WHERE ${where}`,
      params,
    );
    const rows = await sqlRows<ConsumerListRow>(
      this.dataSource,
      `SELECT ${CONSUMER_ITEM_COLUMNS}
       FROM data_hub_consumers c ${CONSUMER_ITEM_JOINS}
       WHERE ${where}
       ORDER BY c.created_at DESC, c.id DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );

    const ids = rows.map((r) => Number(r.id));
    const [counts, soAppIds] = await Promise.all([
      this.counts.loadServiceCounts(ids),
      loadSoAppUserIds(this.dataSource, ids),
    ]);
    const users = await this.userRefs.resolve([...soAppIds.values()].flat());
    return {
      data: rows.map((r) => this.toItem(r, counts, users, soAppIds.get(Number(r.id)) ?? [])),
      meta: { total: Number(countRow?.total ?? 0), page, limit },
    };
  }

  async detail(id: number) {
    const [row] = await sqlRows<ConsumerDetailRow>(
      this.dataSource,
      `SELECT ${CONSUMER_ITEM_COLUMNS}, c.version_no,
              c.created_by, c.updated_by, c.created_at, c.updated_at
       FROM data_hub_consumers c ${CONSUMER_ITEM_JOINS}
       WHERE c.id = $1 AND ${liveSql('c')}`,
      [id],
    );
    if (!row) throw new NotFoundException('CONSUMER_NOT_FOUND');

    const [counts, termCounts, soAppIds] = await Promise.all([
      this.counts.loadServiceCounts([id]),
      this.counts.loadTermCounts([id]),
      loadSoAppUserIds(this.dataSource, [id]),
    ]);
    const soAppUserIds = soAppIds.get(id) ?? [];
    const users = await this.userRefs.resolve([...soAppUserIds, row.created_by, row.updated_by]);
    return {
      ...this.toItem(row, counts, users, soAppUserIds),
      term_count: termCounts.get(id) ?? 0,
      version_no: row.version_no,
      created_by_user: this.userRefs.toRef(users, row.created_by),
      updated_by_user: this.userRefs.toRef(users, row.updated_by),
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  async histories(id: number, q: DataHubPageQueryDto) {
    const { page, limit, offset } = toPaging(q);
    const [exists] = await sqlRows<{ ok: number }>(
      this.dataSource,
      `SELECT 1 AS ok FROM data_hub_consumers c WHERE c.id = $1 AND ${liveSql('c')}`,
      [id],
    );
    if (!exists) throw new NotFoundException('CONSUMER_NOT_FOUND');

    const [countRow] = await sqlRows<{ total: number }>(
      this.dataSource,
      `SELECT COUNT(*)::int AS total FROM data_hub_consumer_histories h WHERE h.consumer_id = $1 AND ${liveSql('h')}`,
      [id],
    );
    const rows = await sqlRows<{
      id: number;
      version_no: number;
      action: string;
      snapshot: Record<string, unknown>;
      changed_by: number;
      created_at: Date;
    }>(
      this.dataSource,
      `SELECT h.id, h.version_no, h.action, h.snapshot, h.changed_by, h.created_at
       FROM data_hub_consumer_histories h
       WHERE h.consumer_id = $1 AND ${liveSql('h')}
       ORDER BY h.version_no DESC
       LIMIT $2 OFFSET $3`,
      [id, limit, offset],
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
      meta: { total: Number(countRow?.total ?? 0), page, limit },
    };
  }

  private toItem(
    r: ConsumerListRow,
    counts: Map<number, { api: number; sftp: number }>,
    users: Map<number, DataHubUserRef>,
    soAppUserIds: number[],
  ) {
    const c = counts.get(Number(r.id));
    return {
      id: r.id,
      code: r.code,
      name: r.name,
      category: r.category,
      short_description: r.short_description,
      avatar_url: r.avatar_url,
      status: r.status,
      division: org(r.division_id, r.division_code, r.division_name),
      so_apps: this.userRefs.toRefs(users, soAppUserIds),
      api_count: c?.api ?? 0,
      sftp_count: c?.sftp ?? 0,
    };
  }
}
