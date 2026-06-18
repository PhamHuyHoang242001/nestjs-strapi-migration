import { BadRequestException } from '@nestjs/common';
import { RoleService } from './role.service';

describe('RoleService.saveOwnerAssignments', () => {
  const createService = () => {
    const connection = { query: jest.fn().mockResolvedValue([]) };
    const permissionCache = { invalidateOwnerScopeByRole: jest.fn().mockResolvedValue(undefined) };

    const service = new RoleService(
      {} as any, // roleRepository
      {} as any, // userRepository
      {} as any, // permissionRepository
      connection as any,
      {} as any, // historyLogger
      permissionCache as any,
    );

    return { service, connection, permissionCache };
  };

  const softDeleteCall = (connection: { query: jest.Mock }) =>
    connection.query.mock.calls.find((c) => String(c[0]).includes('UPDATE resource_owners SET deleted_at'));
  const insertCall = (connection: { query: jest.Mock }) =>
    connection.query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO resource_owners'));

  it('clears all SO when given an empty array (regression: must not short-circuit)', async () => {
    const { service, connection, permissionCache } = createService();

    await service.saveOwnerAssignments(42, []);

    // Soft-delete MUST run so existing SO are removed.
    expect(softDeleteCall(connection)).toBeTruthy();
    expect(softDeleteCall(connection)![1]).toEqual([42]);
    // Nothing to insert when clearing.
    expect(insertCall(connection)).toBeUndefined();
    // Cache invalidated so removal takes effect immediately.
    expect(permissionCache.invalidateOwnerScopeByRole).toHaveBeenCalledWith(42);
  });

  it('no-ops on null/undefined (caller opted out)', async () => {
    const { service, connection, permissionCache } = createService();

    await service.saveOwnerAssignments(42, undefined as any);

    expect(connection.query).not.toHaveBeenCalled();
    expect(permissionCache.invalidateOwnerScopeByRole).not.toHaveBeenCalled();
  });

  it('replaces assignments: soft-deletes then inserts new rows', async () => {
    const { service, connection, permissionCache } = createService();

    await service.saveOwnerAssignments(7, [{ resource_type: 'bicc_department', resource_ids: [1, 2] }]);

    expect(softDeleteCall(connection)).toBeTruthy();
    const insert = insertCall(connection);
    expect(insert).toBeTruthy();
    // 2 resource_ids → 2 rows → 6 bind params (type, id, role per row).
    expect(insert![1]).toEqual(['bicc_department', 1, 7, 'bicc_department', 2, 7]);
    expect(permissionCache.invalidateOwnerScopeByRole).toHaveBeenCalledWith(7);
  });

  it('rejects unknown resource_type before mutating', async () => {
    const { service, connection } = createService();

    await expect(
      service.saveOwnerAssignments(7, [{ resource_type: 'not_a_real_type', resource_ids: [1] }]),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(connection.query).not.toHaveBeenCalled();
  });
});
