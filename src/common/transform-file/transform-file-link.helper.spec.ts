import { appendReportCode, buildTransformFileUrl, TransformFileModel } from './transform-file-link.helper';

describe('transform file link helper', () => {
  it('appends report_code to external URL without existing query', () => {
    expect(appendReportCode('https://analytics.vpbank.com.vn/report', 'BICC_1')).toBe(
      'https://analytics.vpbank.com.vn/report?report_code=BICC_1',
    );
  });

  it('appends report_code to external URL with existing query', () => {
    expect(appendReportCode('https://analytics.vpbank.com.vn/report?tab=1', 'BICC_1')).toBe(
      'https://analytics.vpbank.com.vn/report?tab=1&report_code=BICC_1',
    );
  });

  it('builds user transform URL for any supported model', () => {
    expect(
      buildTransformFileUrl({
        id: 12,
        model: TransformFileModel.BI_DIAGNOSTIC_REPORT,
        audience: 'user',
        reportCode: 'BICC_DEPT_12',
      }),
    ).toBe('/api/media/transform-file/12?model=bi_diagnostic_report&report_code=BICC_DEPT_12');
  });

  it('builds admin transform URL without collapsing to user URL', () => {
    expect(
      buildTransformFileUrl({
        id: 99,
        model: TransformFileModel.BI_DIAGNOSTIC_HISTORY_REPORT,
        audience: 'admin',
        reportCode: 'BICC_DEPT_12',
      }),
    ).toBe('/api/admin/media/transform-file/99?model=bi_diagnostic_history_report&report_code=BICC_DEPT_12');
  });

  it('keeps transform model names stable', () => {
    expect(TransformFileModel.BI_DIAGNOSTIC_REPORT).toBe('bi_diagnostic_report');
    expect(TransformFileModel.BI_DIAGNOSTIC_HISTORY_REPORT).toBe('bi_diagnostic_history_report');
  });
});
