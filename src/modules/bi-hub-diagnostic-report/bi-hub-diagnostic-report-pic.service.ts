import { standardizePagination } from '@common/utils';
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SearchPicUserDto, SearchPicByDepartmentDto } from './dto';

const PICS_TABLE = 'bi_hub_diagnostic_report_pics';
const SUPPORTERS_TABLE = 'bi_hub_diagnostic_report_supporters';
const REPORT_TABLE = 'bi_hub_diagnostic_reports';

// Minimal user shape returned by all PIC endpoints (id + email only).
export interface PicUser {
  id: number;
  email: string;
}

// PIC (person-in-charge) read operations: report-metadata batch load + user pickers.
@Injectable()
export class BiHubDiagnosticReportPicService {
  constructor(private readonly dataSource: DataSource) {}

  // ── Batch-load PICs for a set of reports (avoids N+1) ──────────
  // Returns a map reportId -> [{ id, email }]. Excludes soft-deleted pics and users.
  async getPicsByReportIds(reportIds: number[]): Promise<Map<number, PicUser[]>> {
    return this.getUserLinksByReportIds(PICS_TABLE, reportIds);
  }

  // ── Batch-load supporters for a set of reports (avoids N+1) ────
  // Same shape/rules as PICs, read from the supporters link table.
  async getSupportersByReportIds(reportIds: number[]): Promise<Map<number, PicUser[]>> {
    return this.getUserLinksByReportIds(SUPPORTERS_TABLE, reportIds);
  }

  // ── Shared batch-load for a report<->user link table ───────────
  // Returns a map reportId -> [{ id, email }]. Excludes soft-deleted links and users.
  // `linkTable` is a trusted internal constant (never user input) — safe to interpolate.
  private async getUserLinksByReportIds(linkTable: string, reportIds: number[]): Promise<Map<number, PicUser[]>> {
    const map = new Map<number, PicUser[]>();
    if (!reportIds.length) return map;

    const rows: { report_id: number; id: number; email: string }[] = await this.dataSource.query(
      `SELECT l.bi_hub_diagnostic_report_id AS report_id, u.id, u.email
       FROM ${linkTable} l
       INNER JOIN users u ON u.id = l.user_id AND u.deleted_at IS NULL
       WHERE l.bi_hub_diagnostic_report_id = ANY($1)
         AND l.deleted_at IS NULL AND l.is_deleted = false
       ORDER BY l.bi_hub_diagnostic_report_id, u.id`,
      [reportIds],
    );

    for (const r of rows) {
      const list = map.get(r.report_id) || [];
      list.push({ id: Number(r.id), email: r.email });
      map.set(r.report_id, list);
    }
    return map;
  }

  // ── Search users by email keyword (id + email only) ────────────
  // Empty keyword returns an empty page without touching the DB.
  async searchUsers(query: SearchPicUserDto) {
    const page = +(query.page || 1);
    const limit = Math.min(+(query.limit || 10), 100);
    const keyword = (query.keyword || '').trim();

    if (!keyword) {
      return { data: [] as PicUser[], meta: standardizePagination(0, 0, limit, page) };
    }

    const kw = `%${keyword.toLowerCase()}%`;
    const [entries, countResult] = await Promise.all([
      this.dataSource.query(
        `SELECT u.id, u.email
         FROM users u
         WHERE u.deleted_at IS NULL AND LOWER(u.email) LIKE $1
         ORDER BY u.id
         LIMIT $2 OFFSET $3`,
        [kw, limit, (page - 1) * limit],
      ),
      this.dataSource.query(
        `SELECT COUNT(*) AS count FROM users u WHERE u.deleted_at IS NULL AND LOWER(u.email) LIKE $1`,
        [kw],
      ),
    ]);

    const total = +(countResult[0]?.count || 0);
    return { data: entries as PicUser[], meta: standardizePagination(total, entries.length, limit, page) };
  }

  // ── Distinct PIC users across all reports in a department ──────
  async findUsersByDepartment(query: SearchPicByDepartmentDto) {
    return this.findUsersByDepartmentForTable(PICS_TABLE, query);
  }

  // ── Distinct supporter users across all reports in a department ─
  async findSupporterUsersByDepartment(query: SearchPicByDepartmentDto) {
    return this.findUsersByDepartmentForTable(SUPPORTERS_TABLE, query);
  }

  // ── Shared: distinct users linked (via `linkTable`) to any non-deleted report in a dept ─
  // `linkTable` is a trusted internal constant (never user input) — safe to interpolate.
  private async findUsersByDepartmentForTable(linkTable: string, query: SearchPicByDepartmentDto) {
    const deptId = +query.biccDepartmentId;
    const page = +(query.page || 1);
    const limit = Math.min(+(query.limit || 10), 100);
    const keyword = (query.keyword || '').trim();

    // Optional email keyword filter. Keyword is always $2 (right after deptId $1),
    // so the same clause works for both the entries and count queries; LIMIT/OFFSET
    // positions shift accordingly and are read back from the params array length.
    const kwClause = keyword ? ' AND LOWER(u.email) LIKE $2' : '';
    const kwParam = keyword ? [`%${keyword.toLowerCase()}%`] : [];

    const entriesParams = [deptId, ...kwParam, limit, (page - 1) * limit];
    const limitPos = entriesParams.length - 1;
    const offsetPos = entriesParams.length;

    const [entries, countResult] = await Promise.all([
      this.dataSource.query(
        `SELECT DISTINCT u.id, u.email
         FROM ${linkTable} l
         INNER JOIN ${REPORT_TABLE} r ON r.id = l.bi_hub_diagnostic_report_id
           AND r.is_deleted = false AND r.deleted_at IS NULL
         INNER JOIN users u ON u.id = l.user_id AND u.deleted_at IS NULL
         WHERE r.bicc_department_id = $1 AND l.deleted_at IS NULL AND l.is_deleted = false${kwClause}
         ORDER BY u.id
         LIMIT $${limitPos} OFFSET $${offsetPos}`,
        entriesParams,
      ),
      this.dataSource.query(
        `SELECT COUNT(DISTINCT u.id) AS count
         FROM ${linkTable} l
         INNER JOIN ${REPORT_TABLE} r ON r.id = l.bi_hub_diagnostic_report_id
           AND r.is_deleted = false AND r.deleted_at IS NULL
         INNER JOIN users u ON u.id = l.user_id AND u.deleted_at IS NULL
         WHERE r.bicc_department_id = $1 AND l.deleted_at IS NULL AND l.is_deleted = false${kwClause}`,
        [deptId, ...kwParam],
      ),
    ]);

    const total = +(countResult[0]?.count || 0);
    return { data: entries as PicUser[], meta: standardizePagination(total, entries.length, limit, page) };
  }
}
