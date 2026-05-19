import {
  buildDiagnosticHistoryTransformFileUrl,
  buildDiagnosticReportTransformFileUrl,
} from './diagnostic-transform-file-link.helper';

describe('diagnostic transform file link helper', () => {
  it('builds protected transform URL for normal diagnostic report file', () => {
    const url = buildDiagnosticReportTransformFileUrl({
      reportId: 12,
      file: { file_url: '/uploads/report.pdf', type: 'pdf' },
      audience: 'user',
      reportCode: 'BICC_DEPT_12',
    });

    expect(url).toBe('/api/media/transform-file/12?model=bi_diagnostic_report&report_code=BICC_DEPT_12');
  });

  it('builds protected admin and user URLs for normal diagnostic history file', () => {
    const history = {
      id: 99,
      code: 'BICC_DEPT_12',
      diagnostic_files_type: 'pdf',
      diagnostic_files_url: '/uploads/history.pdf',
    } as any;

    expect(buildDiagnosticHistoryTransformFileUrl({ history, audience: 'admin' })).toBe(
      '/api/admin/media/transform-file/99?model=bi_diagnostic_history_report&report_code=BICC_DEPT_12',
    );
    expect(buildDiagnosticHistoryTransformFileUrl({ history, audience: 'user' })).toBe(
      '/api/media/transform-file/99?model=bi_diagnostic_history_report&report_code=BICC_DEPT_12',
    );
  });

  it('keeps external diagnostic report file direct', () => {
    const url = buildDiagnosticReportTransformFileUrl({
      reportId: 12,
      file: { file_url: 'https://realtime-analytics.aws.ndap.vpbank.cloud/dashboard', type: 'superset' },
      audience: 'admin',
      reportCode: 'BICC_DEPT_12',
    });

    expect(url).toBe('https://realtime-analytics.aws.ndap.vpbank.cloud/dashboard?report_code=BICC_DEPT_12');
  });
});
