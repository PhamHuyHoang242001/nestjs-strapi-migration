import { Repository } from 'typeorm';
import { RoleDataAccess, UserDataAccess } from '@modules/databases/data-access.entity';
import { UserRole } from '@modules/databases/user-role.entity';
import { PermissionQueryService } from '../services/permission-query.service';

// Fake QueryBuilder chain resolving to `rows`. Mirrors the helper in
// permission-query.service.spec.ts but also stubs `.distinct()`.
function mockQueryBuilder(rows: unknown[]) {
  const qb: Record<string, jest.Mock> = {};
  qb.createQueryBuilder = jest.fn().mockReturnValue(qb);
  qb.innerJoin = jest.fn().mockReturnValue(qb);
  qb.select = jest.fn().mockReturnValue(qb);
  qb.distinct = jest.fn().mockReturnValue(qb);
  qb.where = jest.fn().mockReturnValue(qb);
  qb.andWhere = jest.fn().mockReturnValue(qb);
  qb.getRawMany = jest.fn().mockResolvedValue(rows);
  return qb;
}

describe('PermissionQueryService.getUsersByRecordPermission', () => {
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

  it('returns (role ∪ user) allow users minus deny users', async () => {
    // 4 parallel calls: allow_role, allow_user, deny_role, deny_user.
    roleDataAccessRepo.getRawMany.mockResolvedValueOnce([{ id: 1, email: 'a@x' }, { id: 2, email: 'b@x' }]);
    userDataAccessRepo.getRawMany.mockResolvedValueOnce([{ id: 2, email: 'b@x' }, { id: 3, email: 'c@x' }]);
    roleDataAccessRepo.getRawMany.mockResolvedValueOnce([{ id: 1, email: 'a@x' }]); // deny role: 1
    userDataAccessRepo.getRawMany.mockResolvedValueOnce([]); // deny user: none

    const result = await service.getUsersByRecordPermission('bi_payment_programs', 1, 'bp_program_confirm_release');

    // allow = {1,2,3}; deny = {1}; final = {2,3}
    expect(result.map((u) => u.id).sort()).toEqual([2, 3]);
  });

  it('deduplicates the same user reached via both sources', async () => {
    roleDataAccessRepo.getRawMany.mockResolvedValueOnce([{ id: 5, email: 'd@x' }]);
    userDataAccessRepo.getRawMany.mockResolvedValueOnce([{ id: 5, email: 'd@x' }]);
    roleDataAccessRepo.getRawMany.mockResolvedValueOnce([]);
    userDataAccessRepo.getRawMany.mockResolvedValueOnce([]);

    const result = await service.getUsersByRecordPermission('bi_payment_programs', 1, 'bp_program_confirm_release');

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ id: 5, email: 'd@x' });
  });

  it('user-exception deny overrides a role allow', async () => {
    roleDataAccessRepo.getRawMany.mockResolvedValueOnce([{ id: 9, email: 'e@x' }]); // allow role
    userDataAccessRepo.getRawMany.mockResolvedValueOnce([]); // allow user
    roleDataAccessRepo.getRawMany.mockResolvedValueOnce([]); // deny role
    userDataAccessRepo.getRawMany.mockResolvedValueOnce([{ id: 9, email: 'e@x' }]); // deny user wins

    const result = await service.getUsersByRecordPermission('bi_payment_programs', 1, 'bp_program_confirm_release');

    expect(result).toEqual([]);
  });

  it('filters the target record by recordId', async () => {
    roleDataAccessRepo.getRawMany.mockResolvedValue([]);
    userDataAccessRepo.getRawMany.mockResolvedValue([]);
    roleDataAccessRepo.getRawMany.mockResolvedValue([]);
    userDataAccessRepo.getRawMany.mockResolvedValue([]);

    await service.getUsersByRecordPermission('bi_payment_programs', 42, 'bp_program_confirm_release');

    expect(roleDataAccessRepo.andWhere).toHaveBeenCalledWith('da.data_id = :recordId', { recordId: 42 });
    expect(userDataAccessRepo.andWhere).toHaveBeenCalledWith('da.data_id = :recordId', { recordId: 42 });
  });

  it('joins the target table and applies soft-delete guards on record + user', async () => {
    roleDataAccessRepo.getRawMany.mockResolvedValue([]);
    userDataAccessRepo.getRawMany.mockResolvedValue([]);
    roleDataAccessRepo.getRawMany.mockResolvedValue([]);
    userDataAccessRepo.getRawMany.mockResolvedValue([]);

    await service.getUsersByRecordPermission('bi_payment_programs', 1, 'bp_program_confirm_release');

    expect(roleDataAccessRepo.innerJoin).toHaveBeenCalledWith('bi_payment_programs', 'rec', 'rec.id = da.data_id');
    expect(roleDataAccessRepo.andWhere).toHaveBeenCalledWith('rec.is_deleted IS NOT TRUE');
    expect(roleDataAccessRepo.andWhere).toHaveBeenCalledWith('rec.deleted_at IS NULL');
    expect(roleDataAccessRepo.andWhere).toHaveBeenCalledWith('u.deleted_at IS NULL');
    expect(roleDataAccessRepo.andWhere).toHaveBeenCalledWith('u.is_deleted IS NOT TRUE');
  });

  it('applies role-source guards (active role, non-deleted membership)', async () => {
    roleDataAccessRepo.getRawMany.mockResolvedValue([]);
    userDataAccessRepo.getRawMany.mockResolvedValue([]);
    roleDataAccessRepo.getRawMany.mockResolvedValue([]);
    userDataAccessRepo.getRawMany.mockResolvedValue([]);

    await service.getUsersByRecordPermission('bi_payment_programs', 1, 'bp_program_confirm_release');

    expect(roleDataAccessRepo.andWhere).toHaveBeenCalledWith('r.status = :status', { status: 'active' });
    expect(roleDataAccessRepo.andWhere).toHaveBeenCalledWith('r.deleted_at IS NULL');
    expect(roleDataAccessRepo.andWhere).toHaveBeenCalledWith('ur.deleted_at IS NULL');
    // User source must NOT carry role guards.
    expect(userDataAccessRepo.andWhere).not.toHaveBeenCalledWith('r.status = :status', { status: 'active' });
  });

  it('filters code via roles_permissions EXISTS for role source and permission join for user source', async () => {
    roleDataAccessRepo.getRawMany.mockResolvedValue([]);
    userDataAccessRepo.getRawMany.mockResolvedValue([]);
    roleDataAccessRepo.getRawMany.mockResolvedValue([]);
    userDataAccessRepo.getRawMany.mockResolvedValue([]);

    await service.getUsersByRecordPermission('bi_payment_programs', 1, 'bp_program_confirm_release');

    const existsCall = roleDataAccessRepo.andWhere.mock.calls.find(
      (args) => typeof args[0] === 'string' && args[0].includes('roles_permissions') && args[0].includes('dar.role_id'),
    );
    expect(existsCall).toBeTruthy();
    expect(existsCall?.[1]).toEqual({ permCode: 'bp_program_confirm_release' });

    expect(userDataAccessRepo.innerJoin).toHaveBeenCalledWith('dau.permission', 'p_filter');
    expect(userDataAccessRepo.andWhere).toHaveBeenCalledWith('p_filter.code = :permCode', {
      permCode: 'bp_program_confirm_release',
    });
  });

  it('rejects a table name that is not a plain SQL identifier', async () => {
    await expect(
      service.getUsersByRecordPermission('bi_payment_programs; DROP TABLE users', 1, 'bp_program_confirm_release'),
    ).rejects.toThrow('Invalid data-access table');
  });

  it('maps null email to null (nullable column on users)', async () => {
    roleDataAccessRepo.getRawMany.mockResolvedValueOnce([{ id: 7, email: null }]);
    userDataAccessRepo.getRawMany.mockResolvedValueOnce([]);
    roleDataAccessRepo.getRawMany.mockResolvedValueOnce([]);
    userDataAccessRepo.getRawMany.mockResolvedValueOnce([]);

    const result = await service.getUsersByRecordPermission('bi_payment_programs', 1, 'bp_program_confirm_release');

    expect(result).toEqual([{ id: 7, email: null }]);
  });
});
