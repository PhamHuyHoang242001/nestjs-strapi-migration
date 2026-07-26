import { BIHubDiagnosticReport } from '@modules/databases/bi-diagnostic-report.entity';
import { BIHubDiagnosticHistoryReport } from '@modules/databases/bi-diagnostic-history-report.entity';
import { standardizePagination } from '@common/utils';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  SearchDiagnosticReportDto,
  SearchDiagnosticHistoryDto,
  SearchUpdatedUserDto,
  SearchPicByDepartmentDto,
} from './dto';
import {
  REPORT_SORT_MAP,
  HISTORY_SORT_MAP,
  formatReport,
  formatHistory,
  applyPicAndUpdatedByFilters,
} from './diagnostic-report-format.helper';
import type { DataScope } from '@common/authorization/types/data-scope.types';
import { applyDataScope } from '@modules/data-access/helpers/data-scope-applier';
import { PermissionCacheService } from '@common/authorization/services/permission-cache.service';
import { OwnerScopeResolverService } from '@common/authorization/services/owner-scope-resolver.service';
import { BiHubDiagnosticReportPicService } from './bi-hub-diagnostic-report-pic.service';

const REPORT_TABLE = 'bi_hub_diagnostic_reports';

// Write verbs whose holders may mutate a report. Used to derive the per-record
// isUpdate/isDelete capability flags returned by findOne.
const DIAG_EDIT_VERB = 'bh_diag_report_edit';
const DIAG_DELETE_VERB = 'bh_diag_report_delete';

// Caller identity needed to derive write-capability flags. Built in the controller
// from req.info.user; null userId (legacy/anonymous contract) yields no capability.
export interface ReportViewerAuth {
  userId: number | null;
  isSuperAdmin: boolean;
}

// User-facing read operations for diagnostic reports
@Injectable()
export class BiHubDiagnosticReportService {
  constructor(
    @InjectRepository(BIHubDiagnosticReport)
    readonly reportRepo: Repository<BIHubDiagnosticReport>,
    @InjectRepository(BIHubDiagnosticHistoryReport)
    private readonly historyRepo: Repository<BIHubDiagnosticHistoryReport>,
    readonly dataSource: DataSource,
    private readonly permissionCache: PermissionCacheService,
    private readonly ownerScope: OwnerScopeResolverService,
    private readonly picService: BiHubDiagnosticReportPicService,
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
    applyPicAndUpdatedByFilters(qb, { picIds: query.picIds, updatedByIds: query.updatedByIds });

    const sortCol = REPORT_SORT_MAP[query.sortField || 'createdAt'] || 'created_at';
    const sortDir = (query.sortValue?.toUpperCase() as 'ASC' | 'DESC') || 'DESC';
    qb.orderBy(`report.${sortCol}`, sortDir);

    const data = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();
    const totalItems = await qb.getCount();

    const reportIds = data.map((r) => r.id);
    const [picsMap, supportersMap] = await Promise.all([
      this.picService.getPicsByReportIds(reportIds),
      this.picService.getSupportersByReportIds(reportIds),
    ]);
    const formatted = data.map((r) => ({
      ...formatReport(r),
      pics: picsMap.get(r.id) || [],
      supporters: supportersMap.get(r.id) || [],
    }));

    return {
      data: formatted,
      meta: standardizePagination(totalItems, data.length, limit, page),
    };
  }

  // ── View single report ─────────────────────────────────────────
  // 404 = report truly absent. 403 = exists but outside caller's data scope.
  // Existence is intentionally exposed so callers see a clear permission error.
  async findOne(id: number, scope: DataScope | null, auth: ReportViewerAuth | null = null) {
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
    const { isUpdate, isDelete } = await this.resolveWriteFlags(id, auth);
    const [picsMap, supportersMap] = await Promise.all([
      this.picService.getPicsByReportIds([id]),
      this.picService.getSupportersByReportIds([id]),
    ]);
    return {
      ...formatReport(report),
      pics: picsMap.get(id) || [],
      supporters: supportersMap.get(id) || [],
      isUpdate,
      isDelete,
    };
  }

  // ── Derive per-record write capability for the current viewer ──
  // Mirrors the write guard chain (PermissionGuard → OwnerScopeGuard → applyDataScope):
  //   - super_admin                  → always allowed
  //   - explicit verb holder         → record in data-access scope OR in owned subtree
  //   - owner-implied verb holder(SO)→ allowed only when the record is in the owned subtree
  //   - otherwise                    → denied
  // The owned-subtree probe is shared across both verbs and resolved at most once.
  private async resolveWriteFlags(
    reportId: number,
    auth: ReportViewerAuth | null,
  ): Promise<{ isUpdate: boolean; isDelete: boolean }> {
    if (!auth?.userId) return { isUpdate: false, isDelete: false };
    if (auth.isSuperAdmin) return { isUpdate: true, isDelete: true };
    const userId = auth.userId;

    const [permissions, impliedVerbs] = await Promise.all([
      this.permissionCache.getPermissions(userId),
      this.ownerScope.getUserImpliedVerbs(userId),
    ]);

    // Memoize the owned-scope SQL walk as a promise so concurrent verb checks
    // share a single probe without racing.
    let ownedScopeProbe: Promise<boolean> | null = null;
    const isInOwnedScope = () => {
      if (ownedScopeProbe === null) ownedScopeProbe = this.ownerScope.isInOwnedScope(userId, REPORT_TABLE, reportId);
      return ownedScopeProbe;
    };

    const resolveVerb = async (verb: string): Promise<boolean> => {
      if (permissions.has(verb)) {
        const accessible = await this.permissionCache.getAccessibleRecords(userId, REPORT_TABLE, verb);
        if (accessible.includes(reportId)) return true;
        return isInOwnedScope();
      }
      if (!impliedVerbs.has(verb)) return false;
      return isInOwnedScope();
    };

    const [isUpdate, isDelete] = await Promise.all([resolveVerb(DIAG_EDIT_VERB), resolveVerb(DIAG_DELETE_VERB)]);
    return { isUpdate, isDelete };
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

  // ── Distinct updater users across all reports in a department ──
  // "Updater" = the user recorded in each report's updated_by_admin_id, for
  // non-deleted reports in the given BICC department.
  async findUpdatedUsersByDepartment(query: SearchPicByDepartmentDto) {
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
         FROM users u
         INNER JOIN bi_hub_diagnostic_reports r ON r.updated_by_admin_id = u.id
           AND r.is_deleted = false AND r.deleted_at IS NULL
         WHERE r.bicc_department_id = $1 AND u.deleted_at IS NULL${kwClause}
         ORDER BY u.id
         LIMIT $${limitPos} OFFSET $${offsetPos}`,
        entriesParams,
      ),
      this.dataSource.query(
        `SELECT COUNT(DISTINCT u.id) AS count
         FROM users u
         INNER JOIN bi_hub_diagnostic_reports r ON r.updated_by_admin_id = u.id
           AND r.is_deleted = false AND r.deleted_at IS NULL
         WHERE r.bicc_department_id = $1 AND u.deleted_at IS NULL${kwClause}`,
        [deptId, ...kwParam],
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
