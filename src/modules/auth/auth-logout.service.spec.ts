import { TOKEN_TYPE, USER_CLIENT } from '@common/enums';
import { RedisAdapter } from '@common/infrastructure/redis.adapter';
import { BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';

jest.mock('@common/infrastructure/redis.adapter', () => ({
  RedisAdapter: { del: jest.fn().mockResolvedValue(1) },
}));

/**
 * Logout parity with the Strapi custom-auth logout: authenticated caller, ownership check on the
 * submitted token, permission-cache invalidation, and the provider end-session URL in the response.
 */
describe('AuthService.logOut', () => {
  const OLD_ENV = process.env;

  const loginRow = (overrides: Record<string, unknown> = {}) => ({
    id: 7,
    client: USER_CLIENT.USER,
    user_id: 42,
    admin_id: null,
    id_token: 'adfs-id-token',
    ...overrides,
  });

  let tokenRepository: { checkTokenValid: jest.Mock; delete: jest.Mock };
  let permissionCache: { invalidateUser: jest.Mock; invalidateOwnerScopeUser: jest.Mock };
  let service: AuthService;

  const build = () => {
    tokenRepository = { checkTokenValid: jest.fn(), delete: jest.fn().mockResolvedValue(undefined) };
    permissionCache = {
      invalidateUser: jest.fn().mockResolvedValue(undefined),
      invalidateOwnerScopeUser: jest.fn().mockResolvedValue(undefined),
    };
    return new AuthService(
      tokenRepository as never,
      {} as never,
      {} as never,
      {} as never,
      permissionCache as never,
    );
  };

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
    service = build();
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('validates the submitted token as a LOGIN token', async () => {
    tokenRepository.checkTokenValid.mockResolvedValue(loginRow());

    await service.logOut({ access_token: 'tok' }, { id: 42 });

    expect(tokenRepository.checkTokenValid).toHaveBeenCalledWith('tok', [TOKEN_TYPE.LOGIN]);
    expect(tokenRepository.delete).toHaveBeenCalledWith({ access_token: 'tok' });
  });

  it('rejects revoking a session that belongs to another user', async () => {
    tokenRepository.checkTokenValid.mockResolvedValue(loginRow({ user_id: 42 }));

    await expect(service.logOut({ access_token: 'tok' }, { id: 99 })).rejects.toBeInstanceOf(BadRequestException);
    expect(tokenRepository.delete).not.toHaveBeenCalled();
  });

  it('rejects an unidentified caller', async () => {
    tokenRepository.checkTokenValid.mockResolvedValue(loginRow());

    await expect(service.logOut({ access_token: 'tok' }, undefined)).rejects.toBeInstanceOf(BadRequestException);
    expect(tokenRepository.delete).not.toHaveBeenCalled();
  });

  it('drops the Redis token allowlist entry for the session owner', async () => {
    tokenRepository.checkTokenValid.mockResolvedValue(loginRow());

    await service.logOut({ access_token: 'tok' }, { id: 42 });

    expect(RedisAdapter.del).toHaveBeenCalledWith('USER_TOKEN_42');
  });

  it('invalidates cached permissions and owner scopes for the session owner', async () => {
    tokenRepository.checkTokenValid.mockResolvedValue(loginRow());

    await service.logOut({ access_token: 'tok' }, { id: 42 });

    expect(permissionCache.invalidateUser).toHaveBeenCalledWith(42);
    expect(permissionCache.invalidateOwnerScopeUser).toHaveBeenCalledWith(42);
  });

  it('returns a null url when SSO is not configured', async () => {
    tokenRepository.checkTokenValid.mockResolvedValue(loginRow());

    await expect(service.logOut({ access_token: 'tok' }, { id: 42 })).resolves.toEqual({ logout: true, url: null });
  });

  it('builds the end-session url with id_token_hint when SSO is configured', async () => {
    process.env.SSO_OIDC_LOGOUT_URI = 'https://adfs.test/adfs/oauth2/logout';
    process.env.SSO_OIDC_CLIENT_ID = 'client-1';
    process.env.BASE_END_USER_URL = 'https://app.test';
    // env.config reads process.env at import time, so the service must be rebuilt from a fresh module registry
    const { AuthService: FreshAuthService } = await import('./auth.service');
    const fresh = new FreshAuthService(
      tokenRepository as never,
      {} as never,
      {} as never,
      {} as never,
      permissionCache as never,
    );
    tokenRepository.checkTokenValid.mockResolvedValue(loginRow());

    const result = await fresh.logOut({ access_token: 'tok' }, { id: 42, username: 'u01' });

    expect(result.url).toContain('https://adfs.test/adfs/oauth2/logout?');
    expect(result.url).toContain('id_token_hint=adfs-id-token');
    expect(result.url).toContain('client_id=client-1');
    expect(result.url).toContain('username=u01');
    expect(result.url).toContain(`post_logout_redirect_uri=${encodeURIComponent('https://app.test/login')}`);
  });
});
