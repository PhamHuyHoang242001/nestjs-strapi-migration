import { Repository } from 'typeorm';
import { RoleDataAccess, UserDataAccess } from '@modules/databases/data-access.entity';
import { UserRole } from '@modules/databases/user-role.entity';
import { PermissionQueryService } from '../services/permission-query.service';

function mockQueryBuilder(rows: unknown[]) {
  const qb: Record<string, jest.Mock> = {};
  qb.createQueryBuilder = jest.fn().mockReturnValue(qb);
  qb.innerJoin = jest.fn().mockReturnValue(qb);
  qb.select = jest.fn().mockReturnValue(qb);
  qb.distinct = jest.fn().mockReturnValue(qb);
  qb.where = jest.fn().mockReturnValue(qb);
  qb.andWhere = jest.fn().mockReturnValue(qb);
  qb.getRawMany = jest.fn().mockResolvedValue(rows);
  qb.query = jest.fn();
  return qb;
}

describe('PermissionQueryService paged record subjects', () => {
  let userRoleRepo: ReturnType<typeof mockQueryBuilder>;
  let userDataAccessRepo: ReturnType<typeof mockQueryBuilder>;
  let roleDataAccessRepo: ReturnType<typeof mockQueryBuilder>;
  let service: PermissionQueryService;

  beforeEach(() => {
    userRoleRepo = mockQueryBuilder([]);
    userDataAccessRepo = mockQueryBuilder([]);
    roleDataAccessRepo = mockQueryBuilder([]);
    service = new PermissionQueryService(
      userRoleRepo as unknown as Repository<UserRole>,
      userDataAccessRepo as unknown as Repository<UserDataAccess>,
      roleDataAccessRepo as unknown as Repository<RoleDataAccess>,
    );
  });

  it('listRolesForRecordPaged pages in SQL and maps rows', async () => {
    roleDataAccessRepo.query.mockResolvedValueOnce([{ total: 3 }]).mockResolvedValueOnce([
      { id: 1, name: 'A' },
      { id: 2, name: 'B' },
    ]);

    const result = await service.listRolesForRecordPaged('bi_hub_bicc_departments', 5, 'bh_bicc_dept_view', {
      search: 'A',
      skip: 0,
      take: 20,
    });

    expect(result).toEqual({
      total: 3,
      items: [
        { id: 1, name: 'A' },
        { id: 2, name: 'B' },
      ],
    });
    expect(roleDataAccessRepo.query).toHaveBeenCalledTimes(2);
    const pageSql = roleDataAccessRepo.query.mock.calls[1][0] as string;
    expect(pageSql).toMatch(/LIMIT \$7 OFFSET \$8/);
    expect(pageSql).toMatch(/NOT EXISTS/);
    expect(pageSql).toMatch(/rp\.deleted_at IS NULL/);
    const pageParams = roleDataAccessRepo.query.mock.calls[1][1] as unknown[];
    expect(pageParams[6]).toBe(20);
    expect(pageParams[7]).toBe(0);
  });

  it('listUsersForRecordPaged pages in SQL and maps null email', async () => {
    roleDataAccessRepo.query.mockResolvedValueOnce([{ total: 1 }]).mockResolvedValueOnce([{ id: 9, email: null }]);

    const result = await service.listUsersForRecordPaged('bi_hub_bicc_departments', 5, 'bh_bicc_dept_view', {
      skip: 20,
      take: 10,
    });

    expect(result).toEqual({ total: 1, items: [{ id: 9, email: null }] });
    const pageSql = roleDataAccessRepo.query.mock.calls[1][0] as string;
    expect(pageSql).toMatch(/LIMIT \$7 OFFSET \$8/);
    expect(pageSql).toMatch(/data_access_users/);
    expect(roleDataAccessRepo.query.mock.calls[1][1][6]).toBe(10);
    expect(roleDataAccessRepo.query.mock.calls[1][1][7]).toBe(20);
  });

  it('rejects a table name that is not a plain SQL identifier', async () => {
    await expect(
      service.listRolesForRecordPaged('bi_hub; DROP', 1, 'bh_bicc_dept_view', { skip: 0, take: 10 }),
    ).rejects.toThrow('Invalid data-access table');
    expect(roleDataAccessRepo.query).not.toHaveBeenCalled();
  });
});
