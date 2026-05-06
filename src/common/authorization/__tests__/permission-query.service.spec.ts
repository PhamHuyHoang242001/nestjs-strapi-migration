import { Repository } from 'typeorm';
import { RoleDataAccess, UserDataAccess } from '@modules/databases/data-access.entity';
import { UserRole } from '@modules/databases/user-role.entity';
import { PermissionQueryService } from '../services/permission-query.service';

/** Helper: build a fake QueryBuilder chain that resolves to `rows` */
function mockQueryBuilder(rows: unknown[]) {
  const qb: Record<string, jest.Mock> = {};
  qb.createQueryBuilder = jest.fn().mockReturnValue(qb);
  qb.innerJoin = jest.fn().mockReturnValue(qb);
  qb.select = jest.fn().mockReturnValue(qb);
  qb.where = jest.fn().mockReturnValue(qb);
  qb.andWhere = jest.fn().mockReturnValue(qb);
  qb.getRawMany = jest.fn().mockResolvedValue(rows);
  return qb;
}

describe('PermissionQueryService', () => {
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

  it('returns union of role-based and exception permission codes', async () => {
    userRoleRepo.getRawMany.mockResolvedValue([{ code: 'report_view' }, { code: 'report_edit' }]);
    userDataAccessRepo.getRawMany.mockResolvedValue([{ code: 'report_edit' }, { code: 'report_delete' }]);

    const result = await service.getUserPermissions(10);
    expect(result).toEqual(expect.arrayContaining(['report_view', 'report_edit', 'report_delete']));
    expect(result).toHaveLength(3);
  });

  it('checks permission through the resolved permission list', async () => {
    userRoleRepo.getRawMany.mockResolvedValue([{ code: 'report_view' }]);
    userDataAccessRepo.getRawMany.mockResolvedValue([]);

    await expect(service.hasPermission(10, 'report_view')).resolves.toBe(true);
    await expect(service.hasPermission(10, 'report_edit')).resolves.toBe(false);
  });

  it('returns user ids by role', async () => {
    userRoleRepo.getRawMany.mockResolvedValue([{ user_id: '1' }, { user_id: 3 }]);

    await expect(service.getUserIdsByRole(5)).resolves.toEqual([1, 3]);
  });

  it('returns accessible records with allow minus deny', async () => {
    // First call: roleIds query returns role 1
    // Subsequent calls return data for allow/deny queries via Promise.all
    let callCount = 0;
    userRoleRepo.getRawMany.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve([{ role_id: 1 }]);
      return Promise.resolve([]);
    });
    // allow_via_role returns [1, 2, 3]
    roleDataAccessRepo.getRawMany.mockResolvedValueOnce([{ data_id: 1 }, { data_id: 2 }, { data_id: 3 }]);
    // allow_via_user returns [3, 4]
    userDataAccessRepo.getRawMany.mockResolvedValueOnce([{ data_id: 3 }, { data_id: 4 }]);
    // deny_via_role returns [2]
    roleDataAccessRepo.getRawMany.mockResolvedValueOnce([{ data_id: 2 }]);
    // deny_via_user returns [4]
    userDataAccessRepo.getRawMany.mockResolvedValueOnce([{ data_id: 4 }]);

    const result = await service.getAccessibleRecords(10, 'bi_hub_reports');
    expect(result).toEqual(expect.arrayContaining([1, 3]));
    expect(result).toHaveLength(2);
  });
});
