import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserType } from '@modules/databases/user.entity';
import { RequestWithInfo } from '@common/types/request-with-info';
import { BearerGuard, PORTAL_ACCESS_DENIED } from '../bearer.guard';

describe('BearerGuard — portal permission', () => {
  const tokenRepository = { checkTokenValid: jest.fn() };
  const userRepository = { checkUserValid: jest.fn() };
  const adminRepository = { checkAdminValid: jest.fn() };
  const reflector = { getAllAndOverride: jest.fn() };
  const permissionCache = { hasPermission: jest.fn() };
  const guard = new BearerGuard(
    tokenRepository as any,
    userRepository as any,
    adminRepository as any,
    {} as any,
    reflector as unknown as Reflector,
    permissionCache as any,
  );

  const request = () =>
    ({
      headers: { authorization: 'Bearer tok', device: {} },
      get: (h: string) => (h === 'origin' ? 'https://portal.corp' : 'portal.corp'),
      protocol: 'https',
      originalUrl: '/api/v1/x',
    }) as unknown as RequestWithInfo;
  const context = (req: RequestWithInfo): ExecutionContext =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({ getRequest: () => req }),
    }) as unknown as ExecutionContext;

  const loginAs = (client: 'user' | 'admin', account: Record<string, unknown>) => {
    tokenRepository.checkTokenValid.mockResolvedValue({ user_id: account.id, admin_id: account.id, client });
    userRepository.checkUserValid.mockResolvedValue(account);
    adminRepository.checkAdminValid.mockResolvedValue(account);
  };

  const env = process.env.NODE_ENV;
  beforeAll(() => (process.env.NODE_ENV = 'test'));
  afterAll(() => (process.env.NODE_ENV = env));
  beforeEach(() => {
    jest.clearAllMocks();
    reflector.getAllAndOverride.mockReturnValue(undefined);
  });

  it('lets a user holding view_portal through', async () => {
    loginAs('user', { id: 5, type: UserType.USER });
    permissionCache.hasPermission.mockResolvedValue(true);
    const req = request();

    await expect(guard.canActivate(context(req))).resolves.toBe(true);
    expect(permissionCache.hasPermission).toHaveBeenCalledWith(5, 'view_portal');
    expect(req.info.hasPortalAccess).toBe(true);
  });

  it('rejects a user without view_portal', async () => {
    loginAs('user', { id: 5, type: UserType.USER });
    permissionCache.hasPermission.mockResolvedValue(false);

    await expect(guard.canActivate(context(request()))).rejects.toThrow(new ForbiddenException(PORTAL_ACCESS_DENIED));
  });

  it('lets a user without view_portal reach a @SkipPortalPermission route, flagged as no access', async () => {
    loginAs('user', { id: 5, type: UserType.USER });
    permissionCache.hasPermission.mockResolvedValue(false);
    reflector.getAllAndOverride.mockReturnValue(true);
    const req = request();

    await expect(guard.canActivate(context(req))).resolves.toBe(true);
    expect(req.info.hasPortalAccess).toBe(false);
  });

  it('super_admin passes without a permission lookup', async () => {
    loginAs('user', { id: 1, type: UserType.SUPER_ADMIN });

    await expect(guard.canActivate(context(request()))).resolves.toBe(true);
    expect(permissionCache.hasPermission).not.toHaveBeenCalled();
  });

  it('rejects an admin-client token (admins hold no role permissions)', async () => {
    loginAs('admin', { id: 5 });

    await expect(guard.canActivate(context(request()))).rejects.toBeInstanceOf(ForbiddenException);
    expect(permissionCache.hasPermission).not.toHaveBeenCalled();
  });
});
