import { BadRequestException } from '@nestjs/common';
import { RecordSubjectsService } from '../services/record-subjects.service';

describe('RecordSubjectsService', () => {
  const pagination = { page: 1, limit: 20, skip: 0 };
  let permissionQuery: {
    listRolesForRecordPaged: jest.Mock;
    listUsersForRecordPaged: jest.Mock;
  };
  let moduleRepo: { findOne: jest.Mock };
  let permissionRepo: { find: jest.Mock };
  let connection: { query: jest.Mock };
  let service: RecordSubjectsService;

  beforeEach(() => {
    permissionQuery = {
      listRolesForRecordPaged: jest.fn().mockResolvedValue({
        total: 1,
        items: [{ id: 7, name: 'Viewer' }],
      }),
      listUsersForRecordPaged: jest.fn().mockResolvedValue({
        total: 1,
        items: [{ id: 3, email: 'a@x' }],
      }),
    };
    moduleRepo = { findOne: jest.fn().mockResolvedValue({ id: 6, table_name: 'bi_hub_bicc_departments' }) };
    permissionRepo = {
      find: jest.fn().mockResolvedValue([{ id: 17, code: 'bh_bicc_dept_view', action: 'read', deleted_at: null }]),
    };
    connection = { query: jest.fn() };
    service = new RecordSubjectsService(permissionQuery as any, moduleRepo as any, permissionRepo as any, connection as any);
  });

  it('lists roles on parent VIEW with child-module permissions and user_count', async () => {
    connection.query
      .mockResolvedValueOnce([{ role_id: 7, id: 21, code: 'bh_report_view', action: 'read' }])
      .mockResolvedValueOnce([{ role_id: 7, user_count: 4 }]);

    const result = await service.listRoles({ table: 'bi_hub_reports', data_id: 5, search: 'Vi' }, pagination);

    expect(permissionQuery.listRolesForRecordPaged).toHaveBeenCalledWith(
      'bi_hub_bicc_departments',
      5,
      'bh_bicc_dept_view',
      { search: 'Vi', skip: 0, take: 20 },
    );
    expect(result).toEqual({
      items: [
        {
          id: 7,
          name: 'Viewer',
          user_count: 4,
          permissions: [{ id: 21, code: 'bh_report_view', action: 'read' }],
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
    });
  });

  it('lists users on parent VIEW', async () => {
    const result = await service.listUsers({ table: 'bi_hub_reports', data_id: 5 }, pagination);
    expect(permissionQuery.listUsersForRecordPaged).toHaveBeenCalledWith(
      'bi_hub_bicc_departments',
      5,
      'bh_bicc_dept_view',
      { search: undefined, skip: 0, take: 20 },
    );
    expect(result.items).toEqual([{ id: 3, email: 'a@x' }]);
  });

  it('rejects root tables', async () => {
    await expect(service.listRoles({ table: 'bi_hub_bicc_departments', data_id: 5 }, pagination)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects unknown tables', async () => {
    await expect(service.listRoles({ table: 'not_a_table', data_id: 5 }, pagination)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects parent module with more than one read permission', async () => {
    permissionRepo.find.mockResolvedValue([
      { code: 'a_view', action: 'read', deleted_at: null },
      { code: 'b_view', action: 'read', deleted_at: null },
    ]);
    await expect(service.listRoles({ table: 'bi_hub_reports', data_id: 5 }, pagination)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects child whose parent is not a rule target', async () => {
    await expect(service.listRoles({ table: 'bi_payment_other_files', data_id: 1 }, pagination)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
