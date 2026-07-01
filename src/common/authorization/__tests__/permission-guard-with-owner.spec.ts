import { ForbiddenException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionGuard } from '../guards/permission.guard';
import { OwnerScopeResolverService } from '../services/owner-scope-resolver.service';
import { PermissionCacheService } from '../services/permission-cache.service';

describe('PermissionGuard with owner-implied verbs', () => {
  const reflector = { getAllAndOverride: jest.fn() };
  const permissionCache = { hasPermission: jest.fn() };
  const ownerScope = { getUserImpliedVerbs: jest.fn() };
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
      ownerScope as unknown as OwnerScopeResolverService,
    );
  });

  it('allows when verb is in role.permissions (non-SO path unchanged)', async () => {
    reflector.getAllAndOverride.mockReturnValue(['report_view']);
    permissionCache.hasPermission.mockResolvedValue(true);

    await expect(guard.canActivate(context({ user: { id: 1 }, client: 'user' }))).resolves.toBe(true);
    expect(ownerScope.getUserImpliedVerbs).not.toHaveBeenCalled();
  });

  it('allows SO when verb is in impliedVerbs (no role.permissions hit)', async () => {
    reflector.getAllAndOverride.mockReturnValue(['report_view']);
    permissionCache.hasPermission.mockResolvedValue(false);
    ownerScope.getUserImpliedVerbs.mockResolvedValue(new Set(['report_view']));

    await expect(guard.canActivate(context({ user: { id: 1 }, client: 'user' }))).resolves.toBe(true);
  });

  it('rejects SO when verb is NOT in impliedVerbs (cross-service request)', async () => {
    reflector.getAllAndOverride.mockReturnValue(['workspace_edit']);
    permissionCache.hasPermission.mockResolvedValue(false);
    ownerScope.getUserImpliedVerbs.mockResolvedValue(new Set(['report_view']));

    await expect(guard.canActivate(context({ user: { id: 1 }, client: 'user' }))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('passes (OR) when at least one verb is in role.permissions ∪ impliedVerbs (multi-code)', async () => {
    reflector.getAllAndOverride.mockReturnValue(['report_view', 'report_edit']);
    permissionCache.hasPermission.mockImplementation(async (_uid: number, code: string) => code === 'report_view');
    ownerScope.getUserImpliedVerbs.mockResolvedValue(new Set(['report_edit']));

    await expect(guard.canActivate(context({ user: { id: 1 }, client: 'user' }))).resolves.toBe(true);
  });

  it('passes (OR) when the user holds just one of the codes and lacks the other entirely', async () => {
    reflector.getAllAndOverride.mockReturnValue(['report_view', 'workspace_edit']);
    permissionCache.hasPermission.mockImplementation(async (_uid: number, code: string) => code === 'report_view');
    ownerScope.getUserImpliedVerbs.mockResolvedValue(new Set(['report_edit']));

    await expect(guard.canActivate(context({ user: { id: 1 }, client: 'user' }))).resolves.toBe(true);
  });

  it('rejects only when NONE of the codes are in role.permissions or impliedVerbs', async () => {
    reflector.getAllAndOverride.mockReturnValue(['report_view', 'workspace_edit']);
    permissionCache.hasPermission.mockResolvedValue(false);
    ownerScope.getUserImpliedVerbs.mockResolvedValue(new Set(['report_edit']));

    await expect(guard.canActivate(context({ user: { id: 1 }, client: 'user' }))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('does not call impliedVerbs when role.permissions already covers all codes', async () => {
    reflector.getAllAndOverride.mockReturnValue(['report_view', 'report_edit']);
    permissionCache.hasPermission.mockResolvedValue(true);

    await expect(guard.canActivate(context({ user: { id: 1 }, client: 'user' }))).resolves.toBe(true);
    expect(ownerScope.getUserImpliedVerbs).not.toHaveBeenCalled();
  });

  describe('sets req.info.verbFromExplicit for OwnerScopeGuard handoff', () => {
    const runWith = async (info: Record<string, unknown>) => {
      await guard.canActivate(context(info));
      return info as { verbFromExplicit?: boolean };
    };

    it('flag=true when all verbs resolved via role.permissions', async () => {
      reflector.getAllAndOverride.mockReturnValue(['report_view']);
      permissionCache.hasPermission.mockResolvedValue(true);

      const info = await runWith({ user: { id: 1 }, client: 'user' });
      expect(info.verbFromExplicit).toBe(true);
      expect(ownerScope.getUserImpliedVerbs).not.toHaveBeenCalled();
    });

    it('flag=true for super_admin (treated as explicit path)', async () => {
      reflector.getAllAndOverride.mockReturnValue(['report_view']);

      const info = await runWith({ user: { id: 1, type: 'super_admin' }, client: 'user' });
      expect(info.verbFromExplicit).toBe(true);
      expect(permissionCache.hasPermission).not.toHaveBeenCalled();
    });

    it('flag=false when verb resolves via SO implied path', async () => {
      reflector.getAllAndOverride.mockReturnValue(['report_view']);
      permissionCache.hasPermission.mockResolvedValue(false);
      ownerScope.getUserImpliedVerbs.mockResolvedValue(new Set(['report_view']));

      const info = await runWith({ user: { id: 1 }, client: 'user' });
      expect(info.verbFromExplicit).toBe(false);
    });

    it('flag=true when ALL multi-verbs resolve via role.permissions', async () => {
      reflector.getAllAndOverride.mockReturnValue(['report_view', 'report_edit']);
      permissionCache.hasPermission.mockResolvedValue(true);

      const info = await runWith({ user: { id: 1 }, client: 'user' });
      expect(info.verbFromExplicit).toBe(true);
    });

    it('flag=false when mixed sources: one role + one implied', async () => {
      reflector.getAllAndOverride.mockReturnValue(['report_view', 'report_edit']);
      permissionCache.hasPermission.mockImplementation(async (_u: number, c: string) => c === 'report_view');
      ownerScope.getUserImpliedVerbs.mockResolvedValue(new Set(['report_edit']));

      const info = await runWith({ user: { id: 1 }, client: 'user' });
      expect(info.verbFromExplicit).toBe(false);
    });

    it('flag=false when all multi-verbs resolve via implied path', async () => {
      reflector.getAllAndOverride.mockReturnValue(['report_view', 'report_edit']);
      permissionCache.hasPermission.mockResolvedValue(false);
      ownerScope.getUserImpliedVerbs.mockResolvedValue(new Set(['report_view', 'report_edit']));

      const info = await runWith({ user: { id: 1 }, client: 'user' });
      expect(info.verbFromExplicit).toBe(false);
    });

    it('flag NOT set when endpoint has no @RequirePermission', async () => {
      reflector.getAllAndOverride.mockReturnValue(undefined);

      const info = await runWith({ user: { id: 1 }, client: 'user' });
      expect(info.verbFromExplicit).toBeUndefined();
    });
  });
});
