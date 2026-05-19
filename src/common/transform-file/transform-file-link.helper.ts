export enum TransformFileModel {
  BI_DIAGNOSTIC_REPORT = 'bi_diagnostic_report',
  BI_DIAGNOSTIC_HISTORY_REPORT = 'bi_diagnostic_history_report',
}

export enum TransformFileExternalType {
  POWER_BI = 'power_bi',
  SUPERSET = 'superset',
}

export type TransformFileAudience = 'admin' | 'user';

const TRANSFORM_FILE_PATHS: Record<TransformFileAudience, string> = {
  admin: '/api/admin/media/transform-file',
  user: '/api/media/transform-file',
};

export function isExternalTransformFile(type?: string | null): boolean {
  return type === TransformFileExternalType.POWER_BI || type === TransformFileExternalType.SUPERSET;
}

export function appendReportCode(url: string, reportCode?: string | null): string {
  if (!url || !reportCode) return url;

  const [withoutHash, hash = ''] = url.split('#', 2);
  const joiner = withoutHash.includes('?') ? '&' : '?';
  const suffix = `report_code=${encodeURIComponent(reportCode)}`;

  return `${withoutHash}${joiner}${suffix}${hash ? `#${hash}` : ''}`;
}

export function buildTransformFileUrl(params: {
  id: number;
  model: TransformFileModel;
  audience: TransformFileAudience;
  reportCode?: string | null;
}): string {
  const query = new URLSearchParams({ model: params.model });
  if (params.reportCode) query.set('report_code', params.reportCode);

  return `${TRANSFORM_FILE_PATHS[params.audience]}/${params.id}?${query.toString()}`;
}
