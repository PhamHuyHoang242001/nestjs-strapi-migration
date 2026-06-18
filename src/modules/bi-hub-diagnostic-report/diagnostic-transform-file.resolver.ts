import { DATA_ACCESS_TABLE } from '@common/enums';
import {
  appendReportCode,
  isExternalTransformFile,
  TransformFileModel,
  TransformFileRequest,
  TransformFileResolver,
  TransformFileResult,
} from '@common/transform-file';
import { RequestInfo } from '@common/types/request-with-info';
import { BIHubDiagnosticHistoryReport } from '@modules/databases/bi-diagnostic-history-report.entity';
import { BiHubDiagnosticFile } from '@modules/databases/bi-diagnostic-file.entity';
import {
  BiDiagnosticLog,
  BiDiagnosticLogActionEnum,
  BiDiagnosticLogClientTypeEnum,
  BiDiagnosticLogStatusEnum,
  BiDiagnosticLogTableEnum,
} from '@modules/databases/bi-diagnostic-log.entity';
import { BIHubDiagnosticReport } from '@modules/databases/bi-diagnostic-report.entity';
import { PermissionCacheService } from '@common/authorization/services/permission-cache.service';
import { OwnerScopeResolverService } from '@common/authorization/services/owner-scope-resolver.service';
import type { DataScope } from '@common/authorization/types/data-scope.types';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

const DIAGNOSTIC_VIEW_VERB = 'bh_diag_report_view';
const REPORT_TABLE = DATA_ACCESS_TABLE.BI_HUB_DIAGNOSTIC_REPORTS;
const BICC_DEPARTMENT_ROOT_TABLE = DATA_ACCESS_TABLE.BI_HUB_BICC_DEPARTMENTS;

@Injectable()
export class DiagnosticTransformFileResolver implements TransformFileResolver {
  constructor(
    @InjectRepository(BIHubDiagnosticReport)
    private readonly reportRepo: Repository<BIHubDiagnosticReport>,
    @InjectRepository(BIHubDiagnosticHistoryReport)
    private readonly historyRepo: Repository<BIHubDiagnosticHistoryReport>,
    @InjectRepository(BiDiagnosticLog)
    private readonly logRepo: Repository<BiDiagnosticLog>,
    private readonly permissionCache: PermissionCacheService,
    private readonly ownerScope: OwnerScopeResolverService,
  ) {}

  supports(model: TransformFileModel): boolean {
    return (
      model === TransformFileModel.BI_DIAGNOSTIC_REPORT || model === TransformFileModel.BI_DIAGNOSTIC_HISTORY_REPORT
    );
  }

  async authorize(request: TransformFileRequest): Promise<void> {
    const userId = Number(request.info?.user?.id);
    if (!userId) throw new ForbiddenException('User not authenticated');

    // Verb gate — mirrors PermissionGuard: the view verb may be held explicitly
    // (role/exception perm) OR implicitly via an owned bicc-department subtree.
    // An SO of a bicc-department holds the verb only via the implied path.
    const hasExplicitVerb = await this.permissionCache.hasPermission(userId, DIAGNOSTIC_VIEW_VERB);
    let ownerOnlyPath = false;
    if (!hasExplicitVerb) {
      const impliedVerbs = await this.ownerScope.getUserImpliedVerbs(userId);
      if (!impliedVerbs.has(DIAGNOSTIC_VIEW_VERB)) throw new ForbiddenException('No permission');
      ownerOnlyPath = true;
    }

    // Build dataScope identically to DataAccessInterceptor: `explicit OR owner_branch`.
    // Owner-only path suppresses the explicit branch so an owner-path caller cannot
    // reach records outside their owned subtree via unrelated admin allow-grants.
    const explicit = ownerOnlyPath
      ? []
      : await this.permissionCache.getAccessibleRecords(userId, REPORT_TABLE, DIAGNOSTIC_VIEW_VERB);
    const ownedRootIds = await this.ownerScope.getOwnedRoots(userId, BICC_DEPARTMENT_ROOT_TABLE);
    const ownedRoots =
      ownedRootIds.length > 0 ? { rootTable: BICC_DEPARTMENT_ROOT_TABLE, rootIds: ownedRootIds } : null;

    request.dataScope = { explicit, ownedRoots };
  }

  async transform(request: TransformFileRequest): Promise<TransformFileResult> {
    if (request.model === TransformFileModel.BI_DIAGNOSTIC_REPORT) {
      return this.transformReport(request.id, request.info, request.dataScope ?? null);
    }

    return this.transformHistory(request.id, request.info, request.dataScope ?? null);
  }

  private async transformReport(id: number, info: RequestInfo, scope: DataScope | null): Promise<TransformFileResult> {
    await this.assertCanAccess(id, scope, info);

    const report = await this.reportRepo.findOne({
      where: { id, is_deleted: false },
      relations: ['bi_hub_diagnostic_files'],
    });
    if (!report) throw new NotFoundException('Report not found');

    const file = this.getLatestFile(report.bi_hub_diagnostic_files);
    if (!file?.file_url) throw new NotFoundException('Report file not found');

    await this.reportRepo.update(id, { total_view: () => 'COALESCE(total_view, 0) + 1' } as any);
    await this.writeDownloadLog(info, {
      table: BiDiagnosticLogTableEnum.REPORT,
      newData: { id: report.id, name: report.name, url: file.file_url, type: file.type },
    });

    return {
      url: isExternalTransformFile(file.type) ? appendReportCode(file.file_url, report.code) : file.file_url,
      type: file.type,
    };
  }

  private async transformHistory(id: number, info: RequestInfo, scope: DataScope | null): Promise<TransformFileResult> {
    const history = await this.historyRepo.findOne({
      where: { id },
      relations: ['bi_hub_diagnostic_report'],
    });
    if (!history || history.bi_hub_diagnostic_report?.is_deleted) {
      throw new NotFoundException('History report not found');
    }

    await this.assertCanAccess(history.bi_hub_diagnostic_report_id, scope, info);
    if (!history.diagnostic_files_url) throw new NotFoundException('History file not found');

    await this.writeDownloadLog(info, {
      table: BiDiagnosticLogTableEnum.REPORT,
      newData: {
        id: history.id,
        report_id: history.bi_hub_diagnostic_report_id,
        url: history.diagnostic_files_url,
        type: history.diagnostic_files_type,
      },
    });

    return {
      url: isExternalTransformFile(history.diagnostic_files_type)
        ? appendReportCode(history.diagnostic_files_url, history.code)
        : history.diagnostic_files_url,
      type: history.diagnostic_files_type,
    };
  }

  private getLatestFile(files?: BiHubDiagnosticFile[]): BiHubDiagnosticFile | null {
    return files?.find((file) => file.lastest_version) || files?.[0] || null;
  }

  // Record gate — allows `explicit OR owner_branch`, mirroring applyDataScope.
  // Owner branch: the report walks up HIERARCHY_MAP to a bicc-department the
  // caller owns. Probed only when the caller actually owns roots.
  private async assertCanAccess(reportId: number, scope: DataScope | null, info: RequestInfo): Promise<void> {
    if (scope === null) return; // admin
    if (scope.explicit.includes(reportId)) return;

    if (scope.ownedRoots !== null) {
      const userId = Number(info?.user?.id);
      if (userId && (await this.ownerScope.isInOwnedScope(userId, REPORT_TABLE, reportId))) return;
    }

    throw new ForbiddenException('No permission');
  }

  private async writeDownloadLog(
    info: RequestInfo,
    params: { table: BiDiagnosticLogTableEnum; newData: Record<string, unknown> },
  ) {
    try {
      const user = info.user;
      await this.logRepo.save(
        this.logRepo.create({
          action: BiDiagnosticLogActionEnum.DOWNLOAD,
          client_email: (user?.email as string | undefined) || null,
          client_type: BiDiagnosticLogClientTypeEnum.USER,
          ip_address: info.ip || null,
          uri: info.url || null,
          log_status: BiDiagnosticLogStatusEnum.SUCCESS,
          old_data: {},
          new_data: params.newData,
          table: params.table,
        }),
      );
    } catch {
      // Transform must not fail only because audit persistence is unavailable.
    }
  }
}
