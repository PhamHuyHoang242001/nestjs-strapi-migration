import { BIHubDiagnosticReport } from '@modules/databases/bi-diagnostic-report.entity';
import { BiHubDiagnosticFile } from '@modules/databases/bi-diagnostic-file.entity';
import { BIHubDiagnosticHistoryReport } from '@modules/databases/bi-diagnostic-history-report.entity';
import { BiHubBiccDepartment } from '@modules/databases/bi-hub-bicc-department.entity';
import { standardizePagination } from '@common/utils';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { CreateDiagnosticReportDto, UpdateDiagnosticReportDto, DownloadDiagnosticReportDto } from './dto';
import { REPORT_SORT_MAP } from './diagnostic-report-format.helper';
import { BiHubDiagnosticReportService } from './bi-hub-diagnostic-report.service';

// Admin write operations for diagnostic reports
@Injectable()
export class BiHubDiagnosticReportWriteService {
  constructor(
    private readonly readService: BiHubDiagnosticReportService,
    private readonly dataSource: DataSource,
  ) {}

  private get reportRepo() {
    return this.readService.reportRepo;
  }

  // ── Create report with transaction ─────────────────────────────
  async create(dto: CreateDiagnosticReportDto, userId: number) {
    return this.dataSource.transaction(async (manager) => {
      const report = manager.create(BIHubDiagnosticReport, {
        name: dto.name,
        summary: dto.summary,
        insight: dto.insight,
        icon: dto.icon,
        is_sensitive: dto.isSensitive,
        bicc_department_id: dto.biccDepartment,
        txt_diagnostic_scope: dto.scopes,
        is_deleted: false,
        version: 0,
        total_view: 0,
        status: 'active' as any,
        created_by_admin_id: userId,
        updated_by_admin_id: userId,
      });
      const saved = await manager.save(report);

      if (dto.file?.fileUrl) {
        const file = manager.create(BiHubDiagnosticFile, {
          file_url: dto.file.fileUrl, name: dto.file.name, type: dto.file.type,
          lastest_version: true, bi_hub_diagnostic_report_id: saved.id, status: 'active' as any,
        });
        await manager.save(file);
      }

      const biccDept = await manager.findOne(BiHubBiccDepartment, { where: { id: dto.biccDepartment } });
      saved.code = `BICC_${biccDept?.code || 'UNKNOWN'}_${saved.id}`;
      await manager.save(saved);

      if (dto.labels?.length) {
        await manager.createQueryBuilder().relation(BIHubDiagnosticReport, 'labels').of(saved.id).add(dto.labels);
      }

      await this.createHistoryRecord(manager, saved.id);
      return { id: saved.id };
    });
  }

  // ── Update report ──────────────────────────────────────────────
  async update(id: number, dto: UpdateDiagnosticReportDto, userId: number, accessibleDataIds?: number[]) {
    if (accessibleDataIds && !accessibleDataIds.includes(id)) throw new ForbiddenException('No permission');

    const existing = await this.reportRepo.findOne({
      where: { id, is_deleted: false },
      relations: ['labels', 'bi_hub_diagnostic_files'],
    });
    if (!existing) throw new NotFoundException('Report not found');

    return this.dataSource.transaction(async (manager) => {
      const updateData: Partial<BIHubDiagnosticReport> = {};
      if (dto.name !== undefined) updateData.name = dto.name;
      if (dto.summary !== undefined) updateData.summary = dto.summary;
      if (dto.insight !== undefined) updateData.insight = dto.insight;
      if (dto.icon !== undefined) updateData.icon = dto.icon;
      if (dto.isSensitive !== undefined) updateData.is_sensitive = dto.isSensitive;
      if (dto.scopes !== undefined) updateData.txt_diagnostic_scope = dto.scopes;
      if (dto.biccDepartment !== undefined) updateData.bicc_department_id = dto.biccDepartment;
      updateData.updated_by_admin_id = userId;

      if (Object.keys(updateData).length) await manager.update(BIHubDiagnosticReport, id, updateData);

      if (dto.file) {
        await manager.update(BiHubDiagnosticFile, { bi_hub_diagnostic_report_id: id, lastest_version: true }, { lastest_version: false });
        if (dto.file.fileUrl) {
          const newFile = manager.create(BiHubDiagnosticFile, {
            file_url: dto.file.fileUrl, name: dto.file.name, type: dto.file.type,
            lastest_version: true, bi_hub_diagnostic_report_id: id, status: 'active' as any,
          });
          await manager.save(newFile);
        }
      }

      if (dto.labels) {
        const existingLabelIds = existing.labels?.map((l) => l.id) || [];
        await manager.createQueryBuilder().relation(BIHubDiagnosticReport, 'labels').of(id).addAndRemove(dto.labels, existingLabelIds);
      }

      await this.createHistoryRecord(manager, id, existing);
      return { id };
    });
  }

  // ── Delete single report ───────────────────────────────────────
  async deleteOne(id: number, accessibleDataIds?: number[]) {
    if (accessibleDataIds && !accessibleDataIds.includes(id)) throw new ForbiddenException('No permission');
    const report = await this.reportRepo.findOne({ where: { id, is_deleted: false } });
    if (!report) throw new NotFoundException('Report not found');
    await this.reportRepo.update(id, { is_deleted: true });
    return { message: 'Delete success' };
  }

  // ── Delete multiple reports ────────────────────────────────────
  async deleteMany(idsStr: string, accessibleDataIds?: number[]) {
    const reportIds = idsStr.split(',').map(Number).filter(Boolean);
    if (!reportIds.length) throw new BadRequestException('Invalid IDs');

    const reports = await this.reportRepo.find({ where: { id: In(reportIds), is_deleted: false } });
    const deletableIds = accessibleDataIds
      ? reports.filter((r) => accessibleDataIds.includes(r.id)).map((r) => r.id)
      : reports.map((r) => r.id);

    if (deletableIds.length > 0) await this.reportRepo.update({ id: In(deletableIds) }, { is_deleted: true });
    return { success: deletableIds.length, error: reports.length - deletableIds.length };
  }

  // ── Download reports ───────────────────────────────────────────
  async download(query: DownloadDiagnosticReportDto, accessibleDataIds?: number[]) {
    const qb = this.reportRepo.createQueryBuilder('report')
      .leftJoinAndSelect('report.bi_hub_diagnostic_files', 'file', 'file.lastest_version = true')
      .leftJoinAndSelect('report.labels', 'label')
      .leftJoinAndSelect('report.bicc_department', 'bicc')
      .where('report.deleted_at IS NULL')
      .andWhere('report.is_deleted = :isDeleted', { isDeleted: query.isDeleted === 'true' });

    if (query.download_type === 'ALL') {
      if (accessibleDataIds?.length > 0) qb.andWhere('report.id IN (:...accessibleDataIds)', { accessibleDataIds });
      else if (accessibleDataIds?.length === 0) return [];
      if (query.keyword?.trim()) qb.andWhere('(report.name ILIKE :kw OR report.summary ILIKE :kw)', { kw: `%${query.keyword.trim()}%` });
      const sortCol = REPORT_SORT_MAP[query.sortField || 'createdAt'] || 'created_at';
      const sortDir = ['ASC', 'DESC'].includes(query.sortValue?.toUpperCase()) ? (query.sortValue.toUpperCase() as 'ASC' | 'DESC') : 'DESC';
      qb.orderBy(`report.${sortCol}`, sortDir);
    } else if (query.download_type === 'MULTIPLE') {
      if (!query.ids) throw new BadRequestException('Missing IDs');
      let idArr = query.ids.split(',').map(Number).filter(Boolean);
      if (!idArr.length) throw new BadRequestException('Invalid IDs');
      // Data access filter for MULTIPLE mode
      if (accessibleDataIds) {
        idArr = idArr.filter((id) => accessibleDataIds.includes(id));
        if (!idArr.length) return [];
      }
      qb.andWhere('report.id IN (:...idArr)', { idArr });
    } else {
      throw new BadRequestException('Invalid download_type');
    }

    const reports = await qb.getMany();
    return reports.map((item) => ({
      ...item,
      bicc_name: item.bicc_department?.name,
      bu_name: item.bu_name,
      labels: item.labels?.map((l) => l.name).join(','),
      scopes: item.txt_diagnostic_scope,
    }));
  }

  // ── Sync group BI manager ──────────────────────────────────────
  async syncGroupManager() {
    // TODO: Adapt to new data_access model
    return { message: 'Sync completed' };
  }

  // ── Create history record ──────────────────────────────────────
  private async createHistoryRecord(manager: EntityManager, reportId: number, oldData?: BIHubDiagnosticReport) {
    const report = await manager.findOne(BIHubDiagnosticReport, {
      where: { id: reportId }, relations: ['bi_hub_diagnostic_files'],
    });
    if (!report) return;

    const latestFile = report.bi_hub_diagnostic_files?.find((f: BiHubDiagnosticFile) => f.lastest_version);
    const history = manager.create(BIHubDiagnosticHistoryReport, {
      name: report.name,
      version: (report.version || 0) + 1,
      change_log: oldData ? { action: 'updated' } : { action: 'created' },
      diagnostic_files_id: latestFile?.id || null,
      diagnostic_files_name: latestFile?.name || null,
      diagnostic_files_url: latestFile?.file_url || null,
      diagnostic_files_type: latestFile?.type || null,
      bi_hub_diagnostic_report_id: reportId,
      is_change_link: report.is_change_link,
      code: report.code,
    });
    await manager.save(history);
    await manager.update(BIHubDiagnosticReport, reportId, { version: () => 'COALESCE(version, 0) + 1' });
  }
}
