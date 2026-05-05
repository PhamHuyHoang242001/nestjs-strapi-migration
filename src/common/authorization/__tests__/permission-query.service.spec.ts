import { DataSource } from 'typeorm';
import { PermissionQueryService } from '../services/permission-query.service';

describe('PermissionQueryService', () => {
  let dataSource: jest.Mocked<Pick<DataSource, 'query'>>;
  let service: PermissionQueryService;

  beforeEach(() => {
    dataSource = { query: jest.fn() };
    service = new PermissionQueryService(dataSource as unknown as DataSource);
  });

  it('returns user permission codes from query rows', async () => {
    dataSource.query.mockResolvedValue([{ code: 'report_view' }, { code: 'report_edit' }]);

    await expect(service.getUserPermissions(10)).resolves.toEqual(['report_view', 'report_edit']);
    expect(dataSource.query).toHaveBeenCalledWith(expect.stringContaining('role_permissions'), [10]);
  });

  it('returns accessible record ids as numbers', async () => {
    dataSource.query.mockResolvedValue([{ data_id: '1' }, { data_id: 2 }]);

    await expect(service.getAccessibleRecords(10, 'bi_hub_reports', 'report_view')).resolves.toEqual([1, 2]);
    expect(dataSource.query).toHaveBeenCalledWith(expect.stringContaining('EXCEPT'), [
      10,
      'bi_hub_reports',
      'report_view',
    ]);
  });

  it('checks permission through the resolved permission list', async () => {
    dataSource.query.mockResolvedValue([{ code: 'report_view' }]);

    await expect(service.hasPermission(10, 'report_view')).resolves.toBe(true);
    await expect(service.hasPermission(10, 'report_edit')).resolves.toBe(false);
  });
});
