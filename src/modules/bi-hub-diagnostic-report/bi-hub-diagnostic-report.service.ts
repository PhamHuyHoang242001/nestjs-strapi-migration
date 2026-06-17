import { BIHubDiagnosticReport } from '@modules/databases/bi-diagnostic-report.entity';
import { BIHubDiagnosticHistoryReport } from '@modules/databases/bi-diagnostic-history-report.entity';
import { standardizePagination } from '@common/utils';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { SearchDiagnosticReportDto, SearchDiagnosticHistoryDto, SearchUpdatedUserDto } from './dto';
import { REPORT_SORT_MAP, HISTORY_SORT_MAP, formatReport, formatHistory } from './diagnostic-report-format.helper';
import type { DataScope } from '@common/authorization/types/data-scope.types';
import { applyDataScope } from '@modules/data-access/helpers/data-scope-applier';

const REPORT_TABLE = 'bi_hub_diagnostic_reports';

// User-facing read operations for diagnostic reports
@Injectable()
export class BiHubDiagnosticReportService {
  constructor(
    @InjectRepository(BIHubDiagnosticReport)
    readonly reportRepo: Repository<BIHubDiagnosticReport>,
    @InjectRepository(BIHubDiagnosticHistoryReport)
    private readonly historyRepo: Repository<BIHubDiagnosticHistoryReport>,
    readonly dataSource: DataSource,
  ) {}

  // ── List reports with pagination + data-access filtering ───────
  async findAll(query: SearchDiagnosticReportDto, scope: DataScope | null) {
    const page = +(query.page || 1);
    const limit = Math.min(+(query.limit || 10), 100);

    if (query.sortField && !REPORT_SORT_MAP[query.sortField]) {
      throw new BadRequestException('Invalid sortField');
    }
    if (query.sortValue && !['ASC', 'DESC'].includes(query.sortValue.toUpperCase())) {
      throw new BadRequestException('Invalid sortValue');
    }

    const qb = this.reportRepo
      .createQueryBuilder('report')
      .leftJoinAndSelect('report.labels', 'label')
      .leftJoinAndSelect('report.bi_hub_diagnostic_files', 'file', 'file.lastest_version = true')
      .where('report.deleted_at IS NULL')
      .andWhere('report.is_deleted = false');

    applyDataScope(qb, 'report', REPORT_TABLE, scope);

    if (query.reportCategoryId) {
      qb.andWhere('report.bicc_department_id = :deptId', { deptId: +query.reportCategoryId });
    }
    if (query.keyword?.trim()) {
      const kw = `%${query.keyword.trim()}%`;
      qb.andWhere(
        '(report.name ILIKE :kw OR report.summary ILIKE :kw OR report.bu_name ILIKE :kw OR report.txt_diagnostic_scope ILIKE :kw)',
        { kw },
      );
    }
    if (query.labelIds) {
      const ids = query.labelIds.split(',').map(Number).filter(Boolean);
      if (ids.length) qb.andWhere('label.id IN (:...labelIds)', { labelIds: ids });
    }
    if (query.reportStatus) {
      qb.andWhere('report.status = :status', { status: query.reportStatus });
    }

    const sortCol = REPORT_SORT_MAP[query.sortField || 'createdAt'] || 'created_at';
    const sortDir = (query.sortValue?.toUpperCase() as 'ASC' | 'DESC') || 'DESC';
    qb.orderBy(`report.${sortCol}`, sortDir);

    const data = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();
    const totalItems = await qb.getCount();

    return {
      data: data.map((r) => formatReport(r)),
      meta: standardizePagination(totalItems, data.length, limit, page),
    };
  }

  // ── View single report ─────────────────────────────────────────
  // 404 = report truly absent. 403 = exists but outside caller's data scope.
  // Existence is intentionally exposed so callers see a clear permission error.
  async findOne(id: number, scope: DataScope | null) {
    const report = await this.reportRepo
      .createQueryBuilder('report')
      .leftJoinAndSelect('report.labels', 'labels')
      .leftJoinAndSelect('report.bi_hub_diagnostic_files', 'files')
      .leftJoinAndSelect('report.bicc_department', 'bicc_department')
      .where('report.id = :id', { id })
      .andWhere('report.is_deleted = false')
      .getOne();
    if (!report) throw new NotFoundException('Report not found');
    await this.assertReportInScope(id, scope);

    report.bi_hub_diagnostic_files = report.bi_hub_diagnostic_files?.filter((f) => f.lastest_version) || [];
    return formatReport(report);
  }

  // ── List users who updated a report ────────────────────────────
  async findUpdatedUsers(query: SearchUpdatedUserDto, scope: DataScope | null) {
    const reportId = +query.reportId;
    if (!reportId) throw new BadRequestException('reportId is required');
    await this.assertReportInScope(reportId, scope);

    const page = +(query.page || 1);
    const limit = Math.min(+(query.limit || 10), 100);
    const sortValue = ['ASC', 'DESC'].includes(query.sortValue?.toUpperCase()) ? query.sortValue.toUpperCase() : 'DESC';
    const keyword = `%${(query.keyword || '').trim().toLowerCase()}%`;

    const [entries, countResult] = await Promise.all([
      this.dataSource.query(
        `SELECT DISTINCT ON (u.email) u.id, u.email
         FROM users u
         INNER JOIN bi_hub_diagnostic_history_reports h ON h.created_by_admin_id = u.id
         WHERE h.bi_hub_diagnostic_report_id = $1 AND u.deleted_at IS NULL AND LOWER(u.email) LIKE $2
         ORDER BY u.email, u.created_at ${sortValue}
         LIMIT $3 OFFSET $4`,
        [reportId, keyword, limit, (page - 1) * limit],
      ),
      this.dataSource.query(
        `SELECT COUNT(DISTINCT u.id) as count FROM users u
         INNER JOIN bi_hub_diagnostic_history_reports h ON h.created_by_admin_id = u.id
         WHERE h.bi_hub_diagnostic_report_id = $1 AND u.deleted_at IS NULL AND LOWER(u.email) LIKE $2`,
        [reportId, keyword],
      ),
    ]);

    const total = +(countResult[0]?.count || 0);
    return { data: entries, meta: standardizePagination(total, entries.length, limit, page) };
  }

  // ── History of a report ────────────────────────────────────────
  async findHistory(query: SearchDiagnosticHistoryDto, scope: DataScope | null) {
    const reportId = +query.reportId;
    if (!reportId) throw new BadRequestException('reportId is required');
    await this.assertReportInScope(reportId, scope);

    const page = +(query.page || 1);
    const limit = Math.min(+(query.limit || 10), 100);
    if (query.sortField && !HISTORY_SORT_MAP[query.sortField]) throw new BadRequestException('Invalid sortField');
    if (query.sortValue && !['ASC', 'DESC'].includes(query.sortValue.toUpperCase()))
      throw new BadRequestException('Invalid sortValue');

    const qb = this.historyRepo
      .createQueryBuilder('h')
      .leftJoinAndSelect('h.bi_hub_diagnostic_report', 'report')
      .leftJoin('h.created_by_admin', 'updater')
      .addSelect(['updater.id', 'updater.email'])
      .where('h.deleted_at IS NULL')
      .andWhere('h.bi_hub_diagnostic_report_id = :reportId', { reportId })
      .andWhere('report.is_deleted = false');

    if (query.keyword?.trim()) qb.andWhere('h.name ILIKE :kw', { kw: `%${query.keyword.trim()}%` });
    if (query.isLinkReportChange !== undefined)
      qb.andWhere('h.is_change_link = :isChange', { isChange: query.isLinkReportChange === 'true' });
    if (query.updatedByIds) {
      const ids = query.updatedByIds.split(',').map(Number).filter(Boolean);
      if (ids.length) qb.andWhere('h.created_by_admin_id IN (:...updatedByIds)', { updatedByIds: ids });
    }

    const sortCol = HISTORY_SORT_MAP[query.sortField || 'createdAt'] || 'created_at';
    const sortDir = (query.sortValue?.toUpperCase() as 'ASC' | 'DESC') || 'DESC';
    qb.orderBy(`h.${sortCol}`, sortDir);

    const data = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();
    const totalItems = await qb.getCount();
    return {
      data: data.map((history) => formatHistory(history)),
      meta: standardizePagination(totalItems, data.length, limit, page),
    };
  }

  // ── Increase view count ────────────────────────────────────────
  async increaseView(reportId: number, scope: DataScope | null) {
    await this.assertReportInScope(reportId, scope);
    const report = await this.reportRepo.findOne({ where: { id: reportId, is_deleted: false } });
    if (!report) throw new NotFoundException('Report not found');

    await this.reportRepo.update(reportId, { total_view: () => 'total_view + 1' } as any);
    return { id: report.id, total_view: (report.total_view || 0) + 1 };
  }

  // ── Scope-check helper — single SQL existence probe ────────────
  private async assertReportInScope(reportId: number, scope: DataScope | null): Promise<void> {
    if (scope === null) return; // admin bypass
    const qb = this.reportRepo
      .createQueryBuilder('report')
      .select('1', 'one')
      .where('report.id = :id', { id: reportId });
    applyDataScope(qb, 'report', REPORT_TABLE, scope);
    const ok = await qb.getRawOne();
    if (!ok) throw new ForbiddenException('No permission');
  }
}
