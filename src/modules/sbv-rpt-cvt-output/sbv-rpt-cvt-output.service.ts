import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Response } from 'express';

import { MA_REPORT_WHOLE_BANK_CODE, MA_REPORT_HEAD_OFFICE_CODE, MA_OUTPUT_BUCKET } from '@configuration/env.config';
import { ZipFileStatus } from '@common/enums/ma-tool.enums';
import { MaToolSbvRptCvtOutput } from '@modules/databases/ma-tool-sbv-rpt-cvt-output.entity';
import { MaToolBranchConfig } from '@modules/databases/ma-tool-branch-config.entity';
import { MaToolMappingUserBranch } from '@modules/databases/ma-tool-mapping-user-branch.entity';
import { MaToolCstbRptProperty } from '@modules/databases/ma-tool-cstb-rpt-property.entity';
import { MaToolCstbRptExportMapping } from '@modules/databases/ma-tool-cstb-rpt-export-mapping.entity';
import { MaToolLogDownloadFile } from '@modules/databases/ma-tool-log-download-file.entity';

import { SearchReportQueryDto } from './dto';
import { SbvRptCvtOutputS3Service } from './sbv-rpt-cvt-output-s3.service';
import { parseReportDateInput, buildSearchDate } from './helpers/report-date.helper';
import { generateNilReports } from './helpers/nil-report-generator.helper';

@Injectable()
export class SbvRptCvtOutputService {
  constructor(
    @InjectRepository(MaToolSbvRptCvtOutput)
    private readonly outputRepo: Repository<MaToolSbvRptCvtOutput>,
    @InjectRepository(MaToolBranchConfig)
    private readonly branchRepo: Repository<MaToolBranchConfig>,
    @InjectRepository(MaToolMappingUserBranch)
    private readonly mappingRepo: Repository<MaToolMappingUserBranch>,
    @InjectRepository(MaToolCstbRptProperty)
    private readonly rptPropertyRepo: Repository<MaToolCstbRptProperty>,
    @InjectRepository(MaToolCstbRptExportMapping)
    private readonly exportMappingRepo: Repository<MaToolCstbRptExportMapping>,
    @InjectRepository(MaToolLogDownloadFile)
    private readonly logRepo: Repository<MaToolLogDownloadFile>,
    private readonly s3Service: SbvRptCvtOutputS3Service,
    private readonly dataSource: DataSource,
  ) {}

  // ─── searchReport ───────────────────────────────────────────────

  async searchReport(query: SearchReportQueryDto, user: Record<string, any>) {
    const userId = Number(user['id']);
    const { reportDate, frq_code, rptCode, branchId, isOldVersion, startDate, endDate, onlyNoData, keyword } = query;

    if (!reportDate) throw new BadRequestException('reportDate is required');

    const { mode: dateMode, baseDate, year, monthIndex } = parseReportDateInput(reportDate);
    let reportSource = '';

    // Fetch special branches (whole-bank, head-office codes)
    const specialBranches = await this.branchRepo.find({
      where: {
        branch_sbv_code: In([MA_REPORT_WHOLE_BANK_CODE, MA_REPORT_HEAD_OFFICE_CODE]),
      },
      select: ['branch_code', 'branch_sbv_code'],
    });
    const wholeBankVnCode = specialBranches.find((x) => x.branch_sbv_code === MA_REPORT_WHOLE_BANK_CODE);
    const headOfficeCode = specialBranches.find((x) => x.branch_sbv_code === MA_REPORT_HEAD_OFFICE_CODE);

    // Build base QueryBuilder
    const qb = this.outputRepo.createQueryBuilder('o').leftJoinAndSelect('o.service_config', 'sc');

    // Apply frequency + date range conditions
    if (frq_code) {
      const frq = frq_code.toUpperCase();
      const period = buildSearchDate(baseDate, frq, dateMode);
      if (period) {
        qb.andWhere('o.frq_code = :frq', { frq });
        qb.andWhere('o.report_date BETWEEN :startDate AND :endDate', {
          startDate: period.startDate,
          endDate: period.endDate,
        });
      }
    } else {
      if (dateMode === 'MONTH') {
        const monthStart = new Date(year, monthIndex, 1);
        let monthEnd = new Date(year, monthIndex + 1, 0);
        const today = new Date();
        if (monthEnd > today) monthEnd = today;
        qb.andWhere('o.report_date BETWEEN :monthStart AND :monthEnd', {
          monthStart,
          monthEnd,
        });
      } else {
        const ranges = buildSearchDate(baseDate);
        if (ranges) {
          qb.andWhere('o.report_date BETWEEN :rangeStart AND :rangeEnd', {
            rangeStart: ranges.startDate,
            rangeEnd: ranges.endDate,
          });
        }
      }
    }

    // Keyword search: filter by rpt_code or file_name
    if (keyword && keyword.trim()) {
      const kw = keyword.trim();
      qb.andWhere('(o.rpt_code ILIKE :keyword OR o.file_name ILIKE :keyword)', {
        keyword: `%${kw}%`,
      });
    }

    // Fetch user's assigned branches + reports in parallel
    const userGroups = await this.getUserGroupPermissionIds(userId);

    const [assignedBranches, assignedReports] = await Promise.all([
      this.mappingRepo.find({
        where: { is_primary: false, user_id: userId },
        relations: ['branch'],
      }),
      userGroups.length > 0
        ? (this.dataSource.query(
            `SELECT DISTINCT p.id, p.frq_code, p.rpt_code, p.branch_rpt_ind
             FROM ma_tool_cstb_rpt_properties p
             INNER JOIN ma_tool_cstb_rpt_properties_group_users_lnk lnk
               ON lnk.ma_tool_cstb_rpt_property_id = p.id
             WHERE lnk.group_permission_id = ANY($1)
               AND p.deleted_at IS NULL`,
            [userGroups],
          ) as Promise<
            Array<{
              id: number;
              frq_code: string;
              rpt_code: string;
              branch_rpt_ind: string;
            }>
          >)
        : Promise.resolve([]),
    ]);

    // Branch filtering
    const requestedBranches = branchId ? branchId.split(',').map((s) => s.trim()) : [];
    let targetBranchCodes: string[];
    if (requestedBranches.length > 0) {
      targetBranchCodes = assignedBranches
        .filter((e) => requestedBranches.includes(e.branch?.branch_code))
        .map((m) => m.branch?.branch_code)
        .filter(Boolean);
      if (requestedBranches.includes(wholeBankVnCode?.branch_code) && headOfficeCode) {
        targetBranchCodes.push(headOfficeCode.branch_code);
      }
    } else {
      targetBranchCodes = assignedBranches.map((m) => m.branch?.branch_code).filter(Boolean);
    }

    const targetBranches =
      requestedBranches.length > 0
        ? assignedBranches.filter((e) => requestedBranches.includes(e.branch?.branch_code?.trim()))
        : assignedBranches;

    if (targetBranchCodes.length === 0) {
      return {
        status: 200,
        message: 'Success',
        data: [],
        meta: { total: 0, reportSource: '' },
      };
    }
    qb.andWhere('o.branch_code IN (:...branchCodes)', {
      branchCodes: targetBranchCodes,
    });

    // Report code filtering
    const allowedRptCodes = (
      frq_code ? assignedReports.filter((r) => r.frq_code === frq_code.toUpperCase()) : assignedReports
    ).map((r) => r.rpt_code);

    let targetRptCodes = rptCode ? rptCode.split(',').map((s) => s.trim()) : [];
    if (targetRptCodes.length > 0) {
      qb.andWhere('o.rpt_code IN (:...rptCodes)', {
        rptCodes: targetRptCodes,
      });
    } else {
      if (allowedRptCodes.length === 0) {
        return {
          status: 200,
          message: 'Success',
          data: [],
          meta: { total: 0, reportSource: '' },
        };
      }
      qb.andWhere('o.rpt_code IN (:...rptCodes)', {
        rptCodes: allowedRptCodes,
      });
      targetRptCodes = allowedRptCodes;
    }

    // Handle isOldVersion=true (early return path)
    const isOld = isOldVersion === 'true';
    if (isOld) {
      if (!startDate || !endDate) {
        throw new BadRequestException('startDate and endDate required for old version');
      }
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      qb.andWhere('o.is_old_version = true');
      qb.andWhere('o.created_at BETWEEN :oldStart AND :oldEnd', {
        oldStart: start,
        oldEnd: end,
      });

      const [reports, total] = await qb.getManyAndCount();
      if (reports[0]) {
        reportSource = reports[0].service_config?.service_name ?? '';
      }
      return {
        status: 200,
        message: 'Success',
        data: reports,
        meta: { total, reportSource },
      };
    }

    // Non-old version: only converted reports
    qb.andWhere('o.is_old_version = false');
    qb.andWhere('o.cvt_status = true');
    const [existingReports, total] = await qb.getManyAndCount();
    if (existingReports[0]) {
      reportSource = existingReports[0].service_config?.service_name ?? '';
    }

    // Generate nil reports if onlyNoData=true
    if (onlyNoData === 'true') {
      const frqFilter = frq_code ? frq_code.toUpperCase() : null;
      const propWhere: any = { rpt_status: true, rpt_code: In(targetRptCodes) };
      if (frqFilter) propWhere.frq_code = frqFilter;

      const [rptProps, allMappings] = await Promise.all([
        this.rptPropertyRepo.find({
          where: propWhere,
          select: ['rpt_code', 'frq_code', 'branch_rpt_ind'],
        }),
        this.exportMappingRepo.find({
          where: { rpt_code: In(targetRptCodes) },
          select: ['rpt_code', 'rpt_code_sbv'],
        }),
      ]);
      const mappingMap = new Map(allMappings.map((m) => [m.rpt_code, m]));

      const nilReports = generateNilReports({
        existingReports,
        rptProps,
        mappingMap,
        frq_code,
        dateMode,
        baseDate,
        year,
        monthIndex,
        targetBranches,
        wholeBankVnCode,
        headOfficeCode,
      });

      const reportList = [...existingReports, ...nilReports];
      return {
        status: 200,
        message: 'Success',
        data: reportList,
        meta: { total: total + nilReports.length, reportSource },
      };
    }

    return {
      status: 200,
      message: 'Success',
      data: existingReports,
      meta: { total, reportSource },
    };
  }

  // ─── downloadReports ────────────────────────────────────────────

  async downloadReports(id: number, user: Record<string, any>, res: Response) {
    if (!id || isNaN(id)) throw new BadRequestException('Invalid id');

    const log = await this.logRepo.findOne({
      where: { id },
    });

    if (!log) throw new BadRequestException('Log not found');

    // Verify ownership — Strapi stores user as JSON blob
    const logUser = log.user as any;
    const currentUserId = Number(user['id']);
    if (!currentUserId || logUser?.id !== currentUserId) {
      throw new ForbiddenException('No permission');
    }

    if (log.download_status !== ZipFileStatus.COMPLETED) {
      throw new BadRequestException('Zip file is not done yet');
    }

    const key = log.zip_file_path;
    if (!key) throw new BadRequestException('Missing file path');

    const file = await this.s3Service.readFile(MA_OUTPUT_BUCKET, key);

    const fileName = log.filename;
    const contentType =
      file.ContentType ||
      (fileName?.toLowerCase().endsWith('.zip')
        ? 'application/zip'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    res.setHeader('Content-Type', contentType);
    if (file.ContentLength) {
      res.setHeader('Content-Length', String(file.ContentLength));
    }
    const encoded = encodeURIComponent(fileName);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encoded}`);

    const body = file.Body;
    if (body && typeof (body as any).pipe === 'function') {
      (body as any).on('error', (err: Error) => {
        if (!res.headersSent) {
          res.status(500).json({ message: 'File download failed' });
        } else {
          res.destroy(err);
        }
      });
      (body as any).pipe(res);
    } else {
      res.end(body);
    }
  }

  // ─── Private helpers ────────────────────────────────────────────

  /**
   * Get user's group_permission IDs via the Strapi junction tables.
   * Mirrors Strapi's getUserPermissions(): union of public + private groups with expiry checks.
   */
  private async getUserGroupPermissionIds(userId: number): Promise<number[]> {
    // Public group permissions (no user link needed)
    const publicRows: Array<{ id: number }> = await this.dataSource.query(
      `SELECT id FROM group_permissions gp
       WHERE gp.is_delete = false
         AND gp.permission_type = 'PUBLIC'
         AND (gp.is_expire_time != true
              OR (gp.is_expire_time = true AND NOW() BETWEEN gp.start_expire_time AND gp.end_expire_time))`,
    );

    // Private group permissions (linked to user, with active group_users check)
    const privateRows: Array<{ id: number }> = await this.dataSource.query(
      `SELECT DISTINCT gp.id
       FROM group_permissions gp
       INNER JOIN group_users_group_permission_lnk gup_lnk
         ON gup_lnk.group_permission_id = gp.id
       INNER JOIN group_users_user_lnk guu_lnk
         ON guu_lnk.group_user_id = gup_lnk.group_user_id AND guu_lnk.user_id = $1
       INNER JOIN group_users gu
         ON gu.id = guu_lnk.group_user_id AND gu.user_status = 'active'
       WHERE gp.is_delete = false
         AND gp.permission_type = 'PRIVATE'
         AND (gp.is_expire_time != true
              OR (gp.is_expire_time = true AND NOW() BETWEEN gp.start_expire_time AND gp.end_expire_time))`,
      [userId],
    );

    const allIds = new Set([...publicRows.map((r) => r.id), ...privateRows.map((r) => r.id)]);
    return Array.from(allIds);
  }
}
