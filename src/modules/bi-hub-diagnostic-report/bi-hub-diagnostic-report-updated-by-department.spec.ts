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

  it('without keyword: no email clause, params are [deptId, limit, offset]', async () => {
    const query = jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: '0' }]);
    const svc = buildService(query);

    await svc.findUpdatedUsersByDepartment({ biccDepartmentId: '3', page: '1', limit: '10' } as any);

    const listSql = query.mock.calls[0][0] as string;
    expect(listSql).not.toContain('LOWER(u.email) LIKE');
    expect(listSql).toContain('LIMIT $2 OFFSET $3');
    expect(query.mock.calls[0][1]).toEqual([3, 10, 0]);
    // Count query carries only the department id.
    expect(query.mock.calls[1][1]).toEqual([3]);
  });

  it('with keyword: adds email LIKE clause and shifts LIMIT/OFFSET positions', async () => {
    const query = jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: '0' }]);
    const svc = buildService(query);

    await svc.findUpdatedUsersByDepartment({ biccDepartmentId: '3', keyword: 'Foo', page: '2', limit: '5' } as any);

    const listSql = query.mock.calls[0][0] as string;
    // Keyword is $2 (right after deptId), LIMIT/OFFSET shift to $3/$4.
    expect(listSql).toContain('AND LOWER(u.email) LIKE $2');
    expect(listSql).toContain('LIMIT $3 OFFSET $4');
    // Keyword is lowercased and wrapped for a contains match; offset = (page-1)*limit = 5.
    expect(query.mock.calls[0][1]).toEqual([3, '%foo%', 5, 5]);
    // Count query filters by the same keyword clause.
    expect(query.mock.calls[1][0]).toContain('AND LOWER(u.email) LIKE $2');
    expect(query.mock.calls[1][1]).toEqual([3, '%foo%']);
  });
});
