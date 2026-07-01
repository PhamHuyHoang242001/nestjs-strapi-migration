import { ForbiddenException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserType } from '@modules/databases/user.entity';
import { PermissionGuard } from '../guards/permission.guard';
import { OwnerScopeResolverService } from '../services/owner-scope-resolver.service';
import { PermissionCacheService } from '../services/permission-cache.service';

describe('PermissionGuard', () => {
  const reflector = { getAllAndOverride: jest.fn() };
  const permissionCache = { hasPermission: jest.fn() };
  const ownerScope = { getUserImpliedVerbs: jest.fn().mockResolvedValue(new Set<string>()) };
  let guard: PermissionGuard;

  const context = (info: Record<string, unknown>): ExecutionContext =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({ getRequest: () => ({ info }) }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    jest.clearAllMocks();
    ownerScope.getUserImpliedVerbs.mockResolvedValue(new Set<string>());
    guard = new PermissionGuard(
      reflector as unknown as Reflector,
      permissionCache as unknown as PermissionCacheService,
      ownerScope as unknown as OwnerScopeResolverService,
    );
  });

  it('allows when no permissions are required', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    await expect(guard.canActivate(context({ user: { id: 1 }, client: 'user' }))).resolves.toBe(true);
  });

  it('allows super_admin users without checking cache', async () => {
    reflector.getAllAndOverride.mockReturnValue(['report_view']);

    await expect(
      guard.canActivate(context({ user: { id: 1, type: UserType.SUPER_ADMIN }, client: 'user' })),
    ).resolves.toBe(true);
    expect(permissionCache.hasPermission).not.toHaveBeenCalled();
  });

  it('does not bypass for regular users (type === user)', async () => {
    reflector.getAllAndOverride.mockReturnValue(['report_view']);
    permissionCache.hasPermission.mockResolvedValue(false);

    await expect(
      guard.canActivate(context({ user: { id: 1, type: UserType.USER }, client: 'user' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('passes when the user holds ALL listed codes (OR superset)', async () => {
    reflector.getAllAndOverride.mockReturnValue(['report_view', 'report_edit']);
    permissionCache.hasPermission.mockResolvedValue(true);

    const info: Record<string, unknown> = { user: { id: 1 }, client: 'user' };
    await expect(guard.canActivate(context(info))).resolves.toBe(true);
    expect(info.verbFromExplicit).toBe(true);
  });

  it('passes with OR semantics when only ONE of several codes is held', async () => {
    reflector.getAllAndOverride.mockReturnValue(['report_view', 'report_edit']);
    // Holds report_view but NOT report_edit; no owner-implied verbs.
    permissionCache.hasPermission.mockImplementation((_id: number, code: string) =>
      Promise.resolve(code === 'report_view'),
    );

    const info: Record<string, unknown> = { user: { id: 1 }, client: 'user' };
    await expect(guard.canActivate(context(info))).resolves.toBe(true);
    expect(info.verbFromExplicit).toBe(true);
  });

  it('keeps verbFromExplicit conservative when the only matched code is owner-implied', async () => {
    reflector.getAllAndOverride.mockReturnValue(['report_view', 'report_edit']);
    permissionCache.hasPermission.mockResolvedValue(false);
    ownerScope.getUserImpliedVerbs.mockResolvedValue(new Set(['report_edit']));

    const info: Record<string, unknown> = { user: { id: 1 }, client: 'user' };
    await expect(guard.canActivate(context(info))).resolves.toBe(true);
    expect(info.verbFromExplicit).toBe(false);
  });

  it('throws only when the user holds NONE of the listed codes', async () => {
    reflector.getAllAndOverride.mockReturnValue(['report_view', 'report_edit']);
    permissionCache.hasPermission.mockResolvedValue(false);
    ownerScope.getUserImpliedVerbs.mockResolvedValue(new Set<string>());

    await expect(guard.canActivate(context({ user: { id: 1 }, client: 'user' }))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
