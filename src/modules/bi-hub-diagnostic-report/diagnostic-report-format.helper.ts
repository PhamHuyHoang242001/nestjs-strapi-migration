import { SelectQueryBuilder } from 'typeorm';
import { BIHubDiagnosticReport } from '@modules/databases/bi-diagnostic-report.entity';
import { BIHubDiagnosticHistoryReport } from '@modules/databases/bi-diagnostic-history-report.entity';
import { TransformFileAudience } from '@common/transform-file';
import {
  buildDiagnosticHistoryTransformFileUrl,
  buildDiagnosticReportTransformFileUrl,
} from './diagnostic-transform-file-link.helper';

// Sort field mapping: FE sends camelCase, DB uses snake_case
export const REPORT_SORT_MAP: Record<string, string> = {
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  total_view: 'total_view',
  name: 'name',
};

export const HISTORY_SORT_MAP: Record<string, string> = {
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  name: 'name',
};

// change_log key marking that the file field changed in an update
export const FILE_CHANGE_KEY = 'file';

// Apply the shared picIds / updatedByIds list filters (comma-separated id strings)
// to a diagnostic-report query. Shared by the list (findAll) and the Excel download
// so both filter identically. The query's root alias MUST be `report`.
// PICs use EXISTS (not a JOIN) so a report matches once regardless of how many of its
// PICs are in the set — keeps getMany/getCount row counts correct.
export function applyPicAndUpdatedByFilters(
  qb: SelectQueryBuilder<BIHubDiagnosticReport>,
  filters: { picIds?: string; updatedByIds?: string },
): void {
  if (filters.picIds) {
    const picIds = filters.picIds.split(',').map(Number).filter(Boolean);
    if (picIds.length) {
      qb.andWhere(
        `EXISTS (SELECT 1 FROM bi_hub_diagnostic_report_pics p
                 WHERE p.bi_hub_diagnostic_report_id = report.id
                   AND p.user_id IN (:...picIds) AND p.deleted_at IS NULL AND p.is_deleted = false)`,
        { picIds },
      );
    }
  }
  if (filters.updatedByIds) {
    const updatedByIds = filters.updatedByIds.split(',').map(Number).filter(Boolean);
    if (updatedByIds.length) qb.andWhere('report.updated_by_admin_id IN (:...updatedByIds)', { updatedByIds });
  }
}

// Resolve a history event's is_change_link: this describes whether THIS event
// touched the file — create with a file attached, or an update whose change set
// included the file field. It must NOT mirror the report's static is_change_link
// flag (which is never toggled by file edits and would make history filtering wrong).
export function resolveHistoryIsChangeLink(input: {
  isCreate: boolean;
  changedKeys?: string[];
  hasLatestFile: boolean;
}): boolean {
  const { isCreate, changedKeys, hasLatestFile } = input;
  return isCreate ? hasLatestFile : (changedKeys || []).includes(FILE_CHANGE_KEY);
}

function formatReportFile(report: BIHubDiagnosticReport, audience: TransformFileAudience): Record<string, any> | null {
  const file = report.bi_hub_diagnostic_files?.[0] || null;
  if (!file) return null;

  const url = buildDiagnosticReportTransformFileUrl({
    reportId: report.id,
    file,
    audience,
    reportCode: report.code,
  });

  if (audience === 'admin') {
    return {
      file_url: url,
      user_file_url: buildDiagnosticReportTransformFileUrl({
        reportId: report.id,
        file,
        audience: 'user',
        reportCode: report.code,
      }),
      type: file.type,
      name: file.name,
    };
  }

  return { url, type: file.type };
}

// Transform report entity to FE response shape
export function formatReport(
  report: BIHubDiagnosticReport,
  audience: TransformFileAudience = 'user',
): Record<string, any> {
  const result: Record<string, any> = {
    id: report.id,
    name: report.name,
    summary: report.summary,
    diagnostic_scopes: report.txt_diagnostic_scope,
    bu_name: report.bu_name,
    file: formatReportFile(report, audience),
    labels: report.labels,
    status: report.status,
    total_view: report.total_view,
    code: report.code,
    icon: report.icon,
    is_sensitive: report.is_sensitive,
    version: report.version,
    is_change_link: report.is_change_link,
    insight: report.insight,
    created_at: report.created_at,
    updated_at: report.updated_at,
  };

  if (report.bicc_department) result.bicc_department = report.bicc_department;

  return result;
}

function formatHistoryFile(
  h: BIHubDiagnosticHistoryReport,
  audience: TransformFileAudience,
): Record<string, any> | null {
  const url = buildDiagnosticHistoryTransformFileUrl({ history: h, audience });
  if (!url) return null;

  if (audience === 'admin') {
    return {
      file_url: url,
      user_file_url: buildDiagnosticHistoryTransformFileUrl({ history: h, audience: 'user' }),
      type: h.diagnostic_files_type,
      name: h.diagnostic_files_name,
    };
  }

  return { url, type: h.diagnostic_files_type };
}

// Transform history entity to FE response shape
export function formatHistory(
  h: BIHubDiagnosticHistoryReport,
  audience: TransformFileAudience = 'user',
): Record<string, any> {
  // Normalize old change_log format { action: "created" } to new format
  const rawLog = h.change_log;
  const change_log =
    rawLog?.change_description !== undefined
      ? rawLog
      : {
          change_description: rawLog?.action === 'created' ? 'create_new' : 'update',
          old_data: rawLog?.old_data ?? null,
          new_data: rawLog?.new_data ?? null,
        };

  return {
    id: h.id,
    name: h.name,
    code: h.code,
    version: h.version,
    is_change_link: h.is_change_link,
    change_log,
    file: formatHistoryFile(h, audience),
    updatedBy: h.created_by_admin ? { id: h.created_by_admin.id, email: h.created_by_admin.email } : null,
    created_at: (h as any).created_at,
    updated_at: (h as any).updated_at,
  };
}
