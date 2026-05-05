import { ForbiddenException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionGuard } from '../guards/permission.guard';
import { PermissionCacheService } from '../services/permission-cache.service';

describe('PermissionGuard', () => {
  const reflector = { getAllAndOverride: jest.fn() };
  const permissionCache = { hasPermission: jest.fn() };
  let guard: PermissionGuard;

  const context = (info: Record<string, unknown>): ExecutionContext =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({ getRequest: () => ({ info }) }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new PermissionGuard(
      reflector as unknown as Reflector,
      permissionCache as unknown as PermissionCacheService,
    );
  });

  it('allows when no permissions are required', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    await expect(guard.canActivate(context({ user: { id: 1 }, client: 'user' }))).resolves.toBe(true);
  });

  it('allows admin clients without checking cache', async () => {
    reflector.getAllAndOverride.mockReturnValue(['report_view']);

    await expect(guard.canActivate(context({ user: { id: 1 }, client: 'admin' }))).resolves.toBe(true);
    expect(permissionCache.hasPermission).not.toHaveBeenCalled();
  });

  it('requires all listed permission codes', async () => {
    reflector.getAllAndOverride.mockReturnValue(['report_view', 'report_edit']);
    permissionCache.hasPermission.mockResolvedValue(true);

    await expect(guard.canActivate(context({ user: { id: 1 }, client: 'user' }))).resolves.toBe(true);
    expect(permissionCache.hasPermission).toHaveBeenCalledTimes(2);
  });

  it('throws when a required permission is missing', async () => {
    reflector.getAllAndOverride.mockReturnValue(['report_view']);
    permissionCache.hasPermission.mockResolvedValue(false);

    await expect(guard.canActivate(context({ user: { id: 1 }, client: 'user' }))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
