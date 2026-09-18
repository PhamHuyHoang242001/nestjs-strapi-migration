import { NotFoundException } from '@nestjs/common';
import { UsersService } from '../users.service';
import { ERROR_CODE } from '@constant/error-code';
import { Permission } from '@modules/databases/permission.entity';

function chainableQb(getOne?: jest.Mock, getMany?: jest.Mock) {
  const qb: Record<string, jest.Mock> = {};
  const self = () => qb;
  qb.leftJoinAndSelect = jest.fn(self);
  qb.innerJoin = jest.fn(self);
  qb.select = jest.fn(self);
  qb.where = jest.fn(self);
  qb.andWhere = jest.fn(self);
  qb.distinct = jest.fn(self);
  qb.getOne = getOne ?? jest.fn();
  qb.getMany = getMany ?? jest.fn().mockResolvedValue([]);
  return qb;
}

describe('UsersService.getMyProfile', () => {
  const userQb = chainableQb();
  const rolePermQb = chainableQb();
  const daPermQb = chainableQb();
  const userRepository = { createQueryBuilder: jest.fn(() => userQb) };
  const permFind = jest.fn();
  const permRepo = {
    createQueryBuilder: jest.fn(),
    find: permFind,
  };
  const dataSource = { getRepository: jest.fn(() => permRepo) };
  const ownerScopeResolver = { getUserImpliedVerbs: jest.fn() };

  let service: UsersService;

  beforeEach(() => {
    jest.clearAllMocks();
    userRepository.createQueryBuilder.mockReturnValue(userQb);
    dataSource.getRepository.mockReturnValue(permRepo);
    permRepo.createQueryBuilder.mockReset();
    permRepo.createQueryBuilder.mockReturnValueOnce(rolePermQb).mockReturnValueOnce(daPermQb);
    ownerScopeResolver.getUserImpliedVerbs.mockResolvedValue(new Set());
    permFind.mockResolvedValue([]);
    service = new UsersService(
      userRepository as any,
      {} as any,
      {} as any,
      {} as any,
      dataSource as any,
      {} as any,
      ownerScopeResolver as any,
    );
  });

  it('loads user+roles without joining role_permissions or user_data_access', async () => {
    userQb.getOne.mockResolvedValue({
      id: 9,
      username: 'u',
      email: 'u@x',
      status: 'active',
      type: 'user',
      user_roles: [{ id: 1, role_id: 3, role: { id: 3, name: 'viewer' } }],
    });
    rolePermQb.getMany.mockResolvedValue([{ id: 10, code: 'a_view' }]);
    daPermQb.getMany.mockResolvedValue([{ id: 11, code: 'a_edit' }]);

    const profile = await service.getMyProfile({ id: 9 } as any);

    const joined = userQb.leftJoinAndSelect.mock.calls.map((c) => c[0]);
    expect(joined).toEqual(['u.user_roles', 'ur.role']);
    expect(joined.join()).not.toContain('role_permissions');
    expect(joined.join()).not.toContain('user_data_access');
    expect(dataSource.getRepository).toHaveBeenCalledWith(Permission);
    expect(permRepo.createQueryBuilder).toHaveBeenCalledTimes(2);
    expect(profile.roles).toEqual(['viewer']);
    expect(profile.permissions.map((p: { id: number }) => p.id).sort()).toEqual([10, 11]);
  });

  it('dedupes the same permission from role and data-access', async () => {
    userQb.getOne.mockResolvedValue({
      id: 9,
      username: 'u',
      email: 'u@x',
      status: 'active',
      type: 'user',
      user_roles: [{ id: 1, role_id: 3, role: { id: 3, name: 'viewer' } }],
    });
    const shared = { id: 10, code: 'a_view' };
    rolePermQb.getMany.mockResolvedValue([shared]);
    daPermQb.getMany.mockResolvedValue([shared]);

    const profile = await service.getMyProfile({ id: 9 } as any);
    expect(profile.permissions).toHaveLength(1);
    expect(profile.permissions[0].id).toBe(10);
  });

  it('throws when user is missing', async () => {
    userQb.getOne.mockResolvedValue(null);
    await expect(service.getMyProfile({ id: 1 } as any)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.getMyProfile({ id: 1 } as any)).rejects.toMatchObject({
      message: ERROR_CODE.A009,
    });
  });

  it('skips role-permission query when the user has no roles', async () => {
    userQb.getOne.mockResolvedValue({
      id: 9,
      username: 'u',
      email: 'u@x',
      status: 'active',
      type: 'user',
      user_roles: [],
    });
    permRepo.createQueryBuilder.mockReset();
    permRepo.createQueryBuilder.mockReturnValue(daPermQb);
    daPermQb.getMany.mockResolvedValue([]);

    await service.getMyProfile({ id: 9 } as any);
    expect(permRepo.createQueryBuilder).toHaveBeenCalledTimes(1);
  });
});
