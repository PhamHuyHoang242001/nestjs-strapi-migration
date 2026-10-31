import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DataHubAccessService, DataHubCaller, DataServiceWriteAction } from '../common/data-hub-access.service';
import { DataHubUserRefService } from '../common/data-hub-user-ref.service';
import { DataHubPageQueryDto, escapeLike, liveSql, searchTerm, toPaging } from '../common/data-hub-query.util';
import { searchRightHolders } from './data-service-right-holders.util';

interface DepartmentRow {
  id: number;
  code: string;
  name: string;
  member_count?: number;
  created_by?: number | null;
  updated_by?: number | null;
  created_at?: Date;
  updated_at: Date;
}

interface MemberRow {
  user_id: number;
  created_by: number | null;
  updated_by: number | null;
  created_at: Date;
  updated_at: Date;
}

// Concurrent permission lookups when annotating department members.
const RIGHTS_LOOKUP_BATCH = 10;

@Injectable()
export class DepartmentConfigQueryService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly userRefs: DataHubUserRefService,
    private readonly access: DataHubAccessService,
  ) {}

  async list(q: DataHubPageQueryDto) {
    const { page, limit, offset } = toPaging(q);
    const params: unknown[] = [];
    let where = liveSql('d');
    const text = searchTerm(q.keyword);
    if (text) {
      params.push(`%${escapeLike(text)}%`);
      where += ` AND (d.code ILIKE $1 ESCAPE '\\' OR d.name ILIKE $1 ESCAPE '\\')`;
    }
    const [count]: Array<{ total: number }> = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total FROM data_hub_departments d WHERE ${where}`,
      params,
    );
    const rows: DepartmentRow[] = await this.dataSource.query(
      `SELECT d.id, d.code, d.name, d.updated_at,
              (SELECT COUNT(*)::int FROM data_hub_department_members m
               WHERE m.department_id = d.id AND ${liveSql('m')}) AS member_count
       FROM data_hub_departments d WHERE ${where}
       ORDER BY d.created_at DESC, d.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );
    return {
      data: rows.map((r) => ({ ...r, id: Number(r.id), member_count: Number(r.member_count ?? 0) })),
      meta: { total: Number(count?.total ?? 0), page, limit },
    };
  }

  // Members carry their current data-service rights (read like the API guard does), so an admin sees who
  // lost a role and can remove them.
  async detail(id: number) {
    const [row]: DepartmentRow[] = await this.dataSource.query(
      `SELECT d.id, d.code, d.name, d.created_by, d.updated_by, d.created_at, d.updated_at
       FROM data_hub_departments d WHERE d.id = $1 AND ${liveSql('d')}`,
      [id],
    );
    if (!row) throw new NotFoundException('DEPARTMENT_NOT_FOUND');
    const members: MemberRow[] = await this.dataSource.query(
      `SELECT m.user_id, m.created_by, m.updated_by, m.created_at, m.updated_at
       FROM data_hub_department_members m WHERE m.department_id = $1 AND ${liveSql('m')} ORDER BY m.id`,
      [id],
    );
    const memberIds = members.map((m) => Number(m.user_id));
    const users = await this.userRefs.resolve([
      ...memberIds,
      ...members.flatMap((m) => [m.created_by, m.updated_by]),
      row.created_by,
      row.updated_by,
    ]);
    // Each lookup may miss the permission cache and query the DB, so members are resolved a few at a time
    // (same order as memberIds) instead of all at once.
    const rights: Array<{ can_create: boolean; can_update: boolean }> = [];
    for (let i = 0; i < memberIds.length; i += RIGHTS_LOOKUP_BATCH) {
      const batch = memberIds.slice(i, i + RIGHTS_LOOKUP_BATCH);
      rights.push(...(await Promise.all(batch.map((u) => this.access.dataServiceRights(u)))));
    }
    return {
      id: Number(row.id),
      code: row.code,
      name: row.name,
      members: members.map((m, i) => ({
        ...this.userRefs.toRef(users, memberIds[i]),
        ...rights[i],
        created_by_user: this.userRefs.toRef(users, m.created_by),
        updated_by_user: this.userRefs.toRef(users, m.updated_by),
        created_at: m.created_at,
        updated_at: m.updated_at,
      })),
      created_by_user: this.userRefs.toRef(users, row.created_by),
      updated_by_user: this.userRefs.toRef(users, row.updated_by),
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  async candidates(id: number, q: DataHubPageQueryDto) {
    await this.assertLive(id);
    const { page, limit, offset } = toPaging(q);
    const { rows, total } = await searchRightHolders(this.dataSource, {
      excludeDepartmentId: id,
      keyword: searchTerm(q.keyword),
      limit,
      offset,
    });
    return { data: rows, meta: { total, page, limit } };
  }

  // Departments for the "Đơn vị phát hành" select of the data-service form.
  async writable(caller: DataHubCaller, action: DataServiceWriteAction) {
    const ids = await this.access.writableDepartmentIds(caller, action);
    if (ids !== null && ids.length === 0) return { data: [] };
    const rows: Array<{ id: number; code: string; name: string }> = await this.dataSource.query(
      `SELECT d.id, d.code, d.name FROM data_hub_departments d
       WHERE ${liveSql('d')} ${ids === null ? '' : 'AND d.id = ANY($1)'} ORDER BY d.code, d.id`,
      ids === null ? [] : [ids],
    );
    return { data: rows.map((r) => ({ ...r, id: Number(r.id) })) };
  }

  private async assertLive(id: number): Promise<void> {
    const rows: unknown[] = await this.dataSource.query(
      `SELECT 1 FROM data_hub_departments d WHERE d.id = $1 AND ${liveSql('d')}`,
      [id],
    );
    if (rows.length === 0) throw new NotFoundException('DEPARTMENT_NOT_FOUND');
  }
}
