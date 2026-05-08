import { BIHubDiagnosticReport } from '@modules/databases/bi-diagnostic-report.entity';

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

// Transform report entity to FE response shape
export function formatReport(report: BIHubDiagnosticReport): Record<string, any> {
  const file = report.bi_hub_diagnostic_files?.[0] || null;
  const result: Record<string, any> = {
    id: report.id,
    name: report.name,
    summary: report.summary,
    diagnostic_scopes: report.txt_diagnostic_scope,
    bu_name: report.bu_name,
    file: file ? { url: file.file_url, type: file.type } : null,
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
