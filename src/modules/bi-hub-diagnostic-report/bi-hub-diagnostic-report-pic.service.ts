import { standardizePagination } from '@common/utils';
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SearchPicUserDto, SearchPicByDepartmentDto } from './dto';

const PICS_TABLE = 'bi_hub_diagnostic_report_pics';
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
    const map = new Map<number, PicUser[]>();
    if (!reportIds.length) return map;

    const rows: { report_id: number; id: number; email: string }[] = await this.dataSource.query(
      `SELECT p.bi_hub_diagnostic_report_id AS report_id, u.id, u.email
       FROM ${PICS_TABLE} p
       INNER JOIN users u ON u.id = p.user_id AND u.deleted_at IS NULL
       WHERE p.bi_hub_diagnostic_report_id = ANY($1)
         AND p.deleted_at IS NULL AND p.is_deleted = false
       ORDER BY p.bi_hub_diagnostic_report_id, u.id`,
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
    const deptId = +query.biccDepartmentId;
    const page = +(query.page || 1);
    const limit = Math.min(+(query.limit || 10), 100);

    const [entries, countResult] = await Promise.all([
      this.dataSource.query(
        `SELECT DISTINCT u.id, u.email
         FROM ${PICS_TABLE} p
         INNER JOIN ${REPORT_TABLE} r ON r.id = p.bi_hub_diagnostic_report_id
           AND r.is_deleted = false AND r.deleted_at IS NULL
         INNER JOIN users u ON u.id = p.user_id AND u.deleted_at IS NULL
         WHERE r.bicc_department_id = $1 AND p.deleted_at IS NULL AND p.is_deleted = false
         ORDER BY u.id
         LIMIT $2 OFFSET $3`,
        [deptId, limit, (page - 1) * limit],
      ),
      this.dataSource.query(
        `SELECT COUNT(DISTINCT u.id) AS count
         FROM ${PICS_TABLE} p
         INNER JOIN ${REPORT_TABLE} r ON r.id = p.bi_hub_diagnostic_report_id
           AND r.is_deleted = false AND r.deleted_at IS NULL
         INNER JOIN users u ON u.id = p.user_id AND u.deleted_at IS NULL
         WHERE r.bicc_department_id = $1 AND p.deleted_at IS NULL AND p.is_deleted = false`,
        [deptId],
      ),
    ]);

    const total = +(countResult[0]?.count || 0);
    return { data: entries as PicUser[], meta: standardizePagination(total, entries.length, limit, page) };
  }
}
