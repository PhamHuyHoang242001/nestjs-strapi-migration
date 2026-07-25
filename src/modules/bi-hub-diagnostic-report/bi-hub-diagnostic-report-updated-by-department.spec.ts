import { BiHubDiagnosticReportService } from './bi-hub-diagnostic-report.service';

// findUpdatedUsersByDepartment: distinct users recorded as updated_by_admin_id
// on non-deleted reports in a BICC department, paginated.
describe('BiHubDiagnosticReportService.findUpdatedUsersByDepartment', () => {
  const buildService = (query: jest.Mock) =>
    new BiHubDiagnosticReportService(
      {} as any, // reportRepo
      {} as any, // historyRepo
      { query } as any, // dataSource
      {} as any, // permissionCache
      {} as any, // ownerScope
      {} as any, // picService
    );

  it('queries reports.updated_by_admin_id scoped by department with pagination', async () => {
    const users = [{ id: 5, email: 'a@x.com' }];
    const query = jest.fn().mockResolvedValueOnce(users).mockResolvedValueOnce([{ count: '2' }]);
    const svc = buildService(query);

    const res = await svc.findUpdatedUsersByDepartment({ biccDepartmentId: '3', page: '1', limit: '10' } as any);

    expect(res.data).toEqual(users);
    expect(res.meta.totalItems).toBe(2);
    // Updaters come from each report's updated_by_admin_id — NOT the history table.
    const listSql = query.mock.calls[0][0] as string;
    expect(listSql).toContain('updated_by_admin_id');
    expect(listSql).toContain('bicc_department_id');
    expect(listSql).not.toContain('bi_hub_diagnostic_history_reports');
    expect(query.mock.calls[0][1]).toEqual([3, 10, 0]);
  });

  it('caps limit at 100', async () => {
    const query = jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: '0' }]);
    const svc = buildService(query);

    await svc.findUpdatedUsersByDepartment({ biccDepartmentId: '3', page: '2', limit: '500' } as any);

    // limit clamped to 100; offset = (page-1)*limit = 100
    expect(query.mock.calls[0][1]).toEqual([3, 100, 100]);
  });
});
