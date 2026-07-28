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

  it('surfaces a record whose edit grant comes ONLY via role (no direct user grant)', async () => {
    // Edit-authority is "edit on the report in general": a role_data_access grant counts
    // just like a user_data_access grant. Here record 7 is editable purely through the role.
    userRoleRepo.getRawMany.mockResolvedValueOnce([{ role_id: 1 }]); // user's active roles
    roleDataAccessRepo.getRawMany
      .mockResolvedValueOnce([{ data_id: 7 }]) // allow_via_role → record 7
      .mockResolvedValueOnce([]); // deny_via_role
    userDataAccessRepo.getRawMany
      .mockResolvedValueOnce([]) // allow_via_user → none
      .mockResolvedValueOnce([]); // deny_via_user

    const result = await service.getAccessibleRecords(10, 'bi_hub_reports', 'bh_diag_report_edit');
    expect(result).toEqual([7]);
  });

  it('joins the target table and filters out soft-deleted records', async () => {
    userRoleRepo.getRawMany.mockResolvedValueOnce([{ role_id: 1 }]);

    await service.getAccessibleRecords(10, 'bi_hub_reports', 'bh_diag_report_view');

    // Target table joined on its id so soft-deleted rows can be excluded
    expect(roleDataAccessRepo.innerJoin).toHaveBeenCalledWith('bi_hub_reports', 'rec', 'rec.id = da.data_id');
    expect(userDataAccessRepo.innerJoin).toHaveBeenCalledWith('bi_hub_reports', 'rec', 'rec.id = da.data_id');

    // Soft-delete filters applied on the joined target record
    expect(roleDataAccessRepo.andWhere).toHaveBeenCalledWith('rec.is_deleted IS NOT TRUE');
    expect(roleDataAccessRepo.andWhere).toHaveBeenCalledWith('rec.deleted_at IS NULL');
  });

  it('excludes junction rows deleted via the is_deleted flag path (both aliases)', async () => {
    userRoleRepo.getRawMany.mockResolvedValueOnce([{ role_id: 1 }]);

    await service.getAccessibleRecords(10, 'bi_hub_reports', 'bh_diag_report_view');

    // Junction soft-delete must check both deleted_at (softDelete) and is_deleted (flag).
    expect(roleDataAccessRepo.andWhere).toHaveBeenCalledWith('dar.deleted_at IS NULL');
    expect(roleDataAccessRepo.andWhere).toHaveBeenCalledWith('dar.is_deleted IS NOT TRUE');
    expect(userDataAccessRepo.andWhere).toHaveBeenCalledWith('dau.deleted_at IS NULL');
    expect(userDataAccessRepo.andWhere).toHaveBeenCalledWith('dau.is_deleted IS NOT TRUE');
  });

  it('rejects a table name that is not a plain SQL identifier', async () => {
    userRoleRepo.getRawMany.mockResolvedValueOnce([{ role_id: 1 }]);

    await expect(service.getAccessibleRecords(10, 'bi_hub_reports; DROP TABLE users')).rejects.toThrow(
      'Invalid data-access table',
    );
  });
});
