import { standardizePagination } from '@common/utils';
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

// BICC department helper operations for diagnostic context
@Injectable()
export class BiHubBiccDepartmentHelperService {
  constructor(private readonly dataSource: DataSource) {}

  // Find admin users associated with reports under a BICC department
  async findAdminByDepartment(biccDepartmentId: number, keyword?: string, page = 1, limit = 10) {
    limit = Math.min(limit, 100);
    const kw = `%${(keyword || '').trim().toLowerCase()}%`;

    const [entries, countResult] = await Promise.all([
      this.dataSource.query(
        `SELECT DISTINCT ON (u.id) u.id, u.email
         FROM users u
         INNER JOIN bi_hub_diagnostic_reports r ON r.created_by = u.id
         WHERE r.bicc_department_id = $1 AND r.is_deleted = false AND r.deleted_at IS NULL
           AND u.deleted_at IS NULL AND LOWER(u.email) LIKE $2
         ORDER BY u.id LIMIT $3 OFFSET $4`,
        [biccDepartmentId, kw, limit, (page - 1) * limit],
      ),
      this.dataSource.query(
        `SELECT COUNT(DISTINCT u.id) as count FROM users u
         INNER JOIN bi_hub_diagnostic_reports r ON r.created_by = u.id
         WHERE r.bicc_department_id = $1 AND r.is_deleted = false AND r.deleted_at IS NULL
           AND u.deleted_at IS NULL AND LOWER(u.email) LIKE $2`,
        [biccDepartmentId, kw],
      ),
    ]);

    const total = +(countResult[0]?.count || 0);
    return { data: entries, meta: standardizePagination(total, entries.length, limit, page) };
  }

  // Find scopes linked to reports under a BICC department via M:N junction
  async findScopeByDepartment(biccDepartmentId: number, keyword?: string) {
    const qb = this.dataSource
      .createQueryBuilder()
      .select('DISTINCT scope.id', 'id')
      .addSelect('scope.name', 'name')
      .addSelect('scope.code', 'code')
      .from('bi_hub_diagnostic_scopes', 'scope')
      .innerJoin('bi_hub_diagnostic_reports_scopes', 'rs', 'rs.bi_hub_diagnostic_scope_id = scope.id')
      .innerJoin('bi_hub_diagnostic_reports', 'report', 'report.id = rs.bi_hub_diagnostic_report_id')
      .where('report.bicc_department_id = :deptId', { deptId: biccDepartmentId })
      .andWhere('report.is_deleted = false')
      .andWhere('report.deleted_at IS NULL')
      .andWhere('scope.deleted_at IS NULL');

    if (keyword?.trim()) {
      qb.andWhere('(scope.name ILIKE :kw OR scope.code ILIKE :kw)', { kw: `%${keyword.trim()}%` });
    }

    const scopes = await qb.getRawMany();
    return { data: scopes };
  }
}
