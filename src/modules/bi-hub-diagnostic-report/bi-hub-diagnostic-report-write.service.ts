import { BIHubDiagnosticReport } from '@modules/databases/bi-diagnostic-report.entity';
import { BiHubDiagnosticFile } from '@modules/databases/bi-diagnostic-file.entity';
import { BIHubDiagnosticHistoryReport } from '@modules/databases/bi-diagnostic-history-report.entity';
import { BiHubBiccDepartment } from '@modules/databases/bi-hub-bicc-department.entity';
import { exportExcelToResponse, ExcelColumn } from '@common/utils';
import { Response } from 'express';
import dayjs from 'dayjs';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { CreateDiagnosticReportDto, UpdateDiagnosticReportDto, DownloadDiagnosticReportDto } from './dto';
import { REPORT_SORT_MAP } from './diagnostic-report-format.helper';
import { BiHubDiagnosticReportService } from './bi-hub-diagnostic-report.service';

// Excel column config for diagnostic report download
const DOWNLOAD_COLUMNS: ExcelColumn[] = [
  { header: 'Report Analysis', key: 'name', width: 30 },
  { header: 'BICC Department', key: 'bicc_name', width: 20 },
  { header: 'BU Name', key: 'bu_name', width: 20 },
  { header: 'Insight', key: 'insight', width: 40 },
  { header: 'Labels', key: 'labels', width: 25 },
  { header: 'Scope', key: 'scopes', width: 30 },
  { header: 'Sensitive Data', key: 'is_sensitive', width: 15 },
  { header: 'File URL', key: 'file_url', width: 40 },
  { header: 'Icon', key: 'icon', width: 15 },
  { header: 'Updated By', key: 'updated_by', width: 25 },
  { header: 'Updated At', key: 'updated_at', width: 20 },
];

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

      await this.createHistoryRecord(manager, saved.id, undefined, undefined, userId);
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

      // Track which fields changed for history change_log
      const changedKeys: string[] = [];
      if (dto.name !== undefined && dto.name !== existing.name) changedKeys.push('name');
      if (dto.summary !== undefined && dto.summary !== existing.summary) changedKeys.push('summary');
      if (dto.insight !== undefined && JSON.stringify(dto.insight) !== JSON.stringify(existing.insight)) changedKeys.push('insight');
      if (dto.icon !== undefined && dto.icon !== existing.icon) changedKeys.push('icon');
      if (dto.isSensitive !== undefined && dto.isSensitive !== existing.is_sensitive) changedKeys.push('is_sensitive');
      if (dto.biccDepartment !== undefined && dto.biccDepartment !== existing.bicc_department_id) changedKeys.push('bicc_department_id');
      if (dto.scopes !== undefined && dto.scopes !== existing.txt_diagnostic_scope) changedKeys.push('txt_diagnostic_scope');
      if (dto.labels) changedKeys.push('labels');
      if (dto.file) changedKeys.push('file');

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

      if (changedKeys.length > 0) {
        await this.createHistoryRecord(manager, id, existing, changedKeys, userId);
      }
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

  // ── Download reports as Excel ───────────────────────────────────
  async download(query: DownloadDiagnosticReportDto, res: Response, accessibleDataIds?: number[]) {
    const qb = this.reportRepo.createQueryBuilder('report')
      .leftJoinAndSelect('report.bi_hub_diagnostic_files', 'file', 'file.lastest_version = true')
      .leftJoinAndSelect('report.labels', 'label')
      .leftJoinAndSelect('report.bicc_department', 'bicc')
      .leftJoin('users', 'updater', 'updater.id = report.updated_by_admin_id')
      .addSelect(['updater.email'])
      .where('report.deleted_at IS NULL')
      .andWhere('report.is_deleted = :isDeleted', { isDeleted: query.isDeleted === 'true' });

    if (query.download_type === 'ALL') {
      if (accessibleDataIds?.length > 0) qb.andWhere('report.id IN (:...accessibleDataIds)', { accessibleDataIds });
      else if (accessibleDataIds?.length === 0) {
        return exportExcelToResponse(res, { sheetName: 'Diagnostic_Reports', columns: DOWNLOAD_COLUMNS, rows: [] });
      }
      if (query.keyword?.trim()) qb.andWhere('(report.name ILIKE :kw OR report.summary ILIKE :kw)', { kw: `%${query.keyword.trim()}%` });
      const sortCol = REPORT_SORT_MAP[query.sortField || 'createdAt'] || 'created_at';
      const sortDir = ['ASC', 'DESC'].includes(query.sortValue?.toUpperCase()) ? (query.sortValue.toUpperCase() as 'ASC' | 'DESC') : 'DESC';
      qb.orderBy(`report.${sortCol}`, sortDir);
    } else if (query.download_type === 'MULTIPLE') {
      if (!query.ids) throw new BadRequestException('Missing IDs');
      let idArr = query.ids.split(',').map(Number).filter(Boolean);
      if (!idArr.length) throw new BadRequestException('Invalid IDs');
      if (accessibleDataIds) {
        idArr = idArr.filter((id) => accessibleDataIds.includes(id));
        if (!idArr.length) {
          return exportExcelToResponse(res, { sheetName: 'Diagnostic_Reports', columns: DOWNLOAD_COLUMNS, rows: [] });
        }
      }
      qb.andWhere('report.id IN (:...idArr)', { idArr });
    } else {
      throw new BadRequestException('Invalid download_type');
    }

    const reports = await qb.getRawAndEntities();

    // Build email map keyed by report ID to avoid raw/entity index misalignment
    const emailMap = new Map<number, string>();
    for (const raw of reports.raw) {
      if (raw.report_id && raw.updater_email) emailMap.set(Number(raw.report_id), raw.updater_email);
    }

    const rows = reports.entities.map((item) => ({
      name: item.name || '',
      bicc_name: item.bicc_department?.name || '',
      bu_name: item.bu_name || '',
      insight: Array.isArray(item.insight) ? item.insight.join(', ') : (item.insight || ''),
      labels: item.labels?.map((l) => l.name).join(', ') || '',
      scopes: item.txt_diagnostic_scope || '',
      is_sensitive: item.is_sensitive ? 'Yes' : 'No',
      file_url: item.bi_hub_diagnostic_files?.[0]?.file_url || '',
      icon: item.icon || '',
      updated_by: emailMap.get(item.id) || '',
      updated_at: item.updated_at ? dayjs(item.updated_at).format('DD/MM/YYYY HH:mm') : '',
    }));

    await exportExcelToResponse(res, { sheetName: 'Diagnostic_Reports', columns: DOWNLOAD_COLUMNS, rows });
  }

  // ── Sync group BI manager ──────────────────────────────────────
  async syncGroupManager() {
    // TODO: Adapt to new data_access model
    return { message: 'Sync completed' };
  }

  // ── Create history record with change tracking ─────────────────
  private async createHistoryRecord(
    manager: EntityManager,
    reportId: number,
    oldData?: BIHubDiagnosticReport,
    changedKeys?: string[],
    userId?: number,
  ) {
    const report = await manager.findOne(BIHubDiagnosticReport, {
      where: { id: reportId },
      relations: ['bi_hub_diagnostic_files', 'labels'],
    });
    if (!report) return;

    const latestFile = report.bi_hub_diagnostic_files?.find((f: BiHubDiagnosticFile) => f.lastest_version);

    // Build change_log: create vs update
    let change_log: Record<string, any>;
    if (!oldData) {
      change_log = {
        change_description: 'create_new',
        old_data: null,
        new_data: this.extractReportSnapshot(report),
      };
    } else {
      const keys = changedKeys || [];
      change_log = {
        change_description: keys,
        old_data: this.extractFieldsByKeys(oldData, keys),
        new_data: this.extractFieldsByKeys(report, keys),
      };
    }

    const history = manager.create(BIHubDiagnosticHistoryReport, {
      name: report.name,
      version: (report.version || 0) + 1,
      change_log,
      diagnostic_files_id: latestFile?.id || null,
      diagnostic_files_name: latestFile?.name || null,
      diagnostic_files_url: latestFile?.file_url || null,
      diagnostic_files_type: latestFile?.type || null,
      bi_hub_diagnostic_report_id: reportId,
      is_change_link: report.is_change_link,
      code: report.code,
      created_by_admin_id: userId,
    });
    await manager.save(history);
    await manager.update(BIHubDiagnosticReport, reportId, { version: () => 'COALESCE(version, 0) + 1' });
  }

  // ── Snapshot all trackable fields from a report ───────────────
  private extractReportSnapshot(report: BIHubDiagnosticReport): Record<string, any> {
    return {
      name: report.name,
      summary: report.summary,
      insight: report.insight,
      icon: report.icon,
      is_sensitive: report.is_sensitive,
      bicc_department_id: report.bicc_department_id,
      txt_diagnostic_scope: report.txt_diagnostic_scope,
      labels: report.labels?.map((l) => ({ id: l.id, name: l.name })),
      bu_name: report.bu_name,
      status: report.status,
    };
  }

  // ── Extract only changed fields from a report snapshot ────────
  private extractFieldsByKeys(data: BIHubDiagnosticReport, keys: string[]): Record<string, any> {
    const snapshot = this.extractReportSnapshot(data);
    return Object.fromEntries(keys.filter((k) => k in snapshot).map((k) => [k, snapshot[k]]));
  }
}
