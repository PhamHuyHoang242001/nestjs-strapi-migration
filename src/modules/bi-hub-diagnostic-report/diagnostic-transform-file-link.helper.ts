import { BIHubDiagnosticHistoryReport } from '@modules/databases/bi-diagnostic-history-report.entity';
import { BiHubDiagnosticFile } from '@modules/databases/bi-diagnostic-file.entity';
import {
  appendReportCode,
  buildTransformFileUrl,
  isExternalTransformFile,
  TransformFileAudience,
  TransformFileModel,
} from '@common/transform-file';

export function buildDiagnosticReportTransformFileUrl(params: {
  reportId: number;
  file: Pick<BiHubDiagnosticFile, 'file_url' | 'type'>;
  audience: TransformFileAudience;
  reportCode?: string | null;
}): string {
  if (isExternalTransformFile(params.file.type)) {
    return appendReportCode(params.file.file_url, params.reportCode);
  }

  return buildTransformFileUrl({
    id: params.reportId,
    model: TransformFileModel.BI_DIAGNOSTIC_REPORT,
    audience: params.audience,
    reportCode: params.reportCode,
  });
}

export function buildDiagnosticHistoryTransformFileUrl(params: {
  history: Pick<BIHubDiagnosticHistoryReport, 'id' | 'code' | 'diagnostic_files_type' | 'diagnostic_files_url'>;
  audience: TransformFileAudience;
}): string | null {
  if (!params.history.diagnostic_files_type || !params.history.diagnostic_files_url) return null;

  if (isExternalTransformFile(params.history.diagnostic_files_type)) {
    return appendReportCode(params.history.diagnostic_files_url, params.history.code);
  }

  return buildTransformFileUrl({
    id: params.history.id,
    model: TransformFileModel.BI_DIAGNOSTIC_HISTORY_REPORT,
    audience: params.audience,
    reportCode: params.history.code,
  });
}
