import { RedisAdapter } from '@common/infrastructure/redis.adapter';
import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { FRONTEND_BASE_URL, PUBLIC_BASE_URL } from '@configuration/env.config';
import { TransformFileAuthGuard } from './transform-file-auth.guard';
import { TransformFileAuthRedirectException } from './transform-file-auth-redirect.exception';

type MockRequest = {
  headers: Record<string, unknown>;
  cookies: Record<string, string>;
  originalUrl: string;
  protocol: string;
  get: (name: string) => string | undefined;
  info?: Record<string, unknown>;
};

const buildRequest = (overrides: Partial<MockRequest> = {}): MockRequest => {
  const { headers, ...rest } = overrides;
  return {
    headers: { ...(headers || {}) },
    cookies: {},
    originalUrl: '/api/media/transform-file/5',
    protocol: 'https',
    get: (name: string) => (name === 'host' ? 'api.example.com' : undefined),
    ...rest,
  };
};

const asContext = (req: MockRequest): ExecutionContext =>
  ({ switchToHttp: () => ({ getRequest: () => req }) }) as unknown as ExecutionContext;

const makeGuard = (over: { verify?: jest.Mock } = {}) => {
  const verify = over.verify ?? jest.fn().mockReturnValue({ id: 1 });
  const jwtService = { verify } as unknown as JwtService;
  const configService = { get: jest.fn().mockReturnValue('test-secret') } as unknown as ConfigService;
  return { guard: new TransformFileAuthGuard(jwtService, configService), verify };
};

describe('TransformFileAuthGuard', () => {
  const realNodeEnv = process.env.NODE_ENV;
  let redisGet: jest.SpyInstance;

  beforeEach(() => {
    // Default: Redis holds a token; individual tests set the matching value.
    redisGet = jest.spyOn(RedisAdapter, 'get').mockResolvedValue(null);
  });
  afterEach(() => {
    process.env.NODE_ENV = realNodeEnv;
    redisGet.mockRestore();
  });

  it('authorizes when the header token matches the Redis allowlist (header wins)', async () => {
    redisGet.mockResolvedValue('header-token');
    const { guard, verify } = makeGuard();
    const req = buildRequest({
      headers: { authorization: 'Bearer header-token' },
      cookies: { access_token: 'cookie-token' },
    });

    await expect(guard.canActivate(asContext(req))).resolves.toBe(true);
    expect(verify).toHaveBeenCalledWith('header-token', { secret: 'test-secret' });
    expect(redisGet).toHaveBeenCalledWith('USER_TOKEN_1');
    expect(req.info?.user).toEqual({ id: 1 });
    expect(req.info?.client).toBe('user');
  });

  it('falls back to the access_token cookie and authorizes when it matches Redis', async () => {
    redisGet.mockResolvedValue('cookie-token');
    const { guard, verify } = makeGuard();
    const req = buildRequest({ cookies: { access_token: 'cookie-token' } });

    await expect(guard.canActivate(asContext(req))).resolves.toBe(true);
    expect(verify).toHaveBeenCalledWith('cookie-token', { secret: 'test-secret' });
  });

  it('redirects to login when no token is present', async () => {
    const { guard } = makeGuard();
    const req = buildRequest();

    await expect(guard.canActivate(asContext(req))).rejects.toBeInstanceOf(TransformFileAuthRedirectException);
    try {
      await guard.canActivate(asContext(req));
    } catch (err) {
      const url = (err as TransformFileAuthRedirectException).url;
      // Return target is built from the configured public origin (PUBLIC_BASE_URL), NOT the request
      // protocol/host — behind an ingress the pod sees an unreachable cluster-internal host.
      expect(url).toContain(`${FRONTEND_BASE_URL}/login?url=`);
      expect(url).toContain(encodeURIComponent(`${PUBLIC_BASE_URL}/api/media/transform-file/5`));
    }
  });

  it('redirects to login when JWT verification fails', async () => {
    const verify = jest.fn(() => {
      throw new Error('jwt expired');
    });
    const { guard } = makeGuard({ verify });
    const req = buildRequest({ cookies: { access_token: 'bad' } });

    await expect(guard.canActivate(asContext(req))).rejects.toBeInstanceOf(TransformFileAuthRedirectException);
  });

  it('redirects to login when the token is not in the Redis allowlist', async () => {
    redisGet.mockResolvedValue(null);
    const { guard } = makeGuard();
    const req = buildRequest({ cookies: { access_token: 'orphan' } });

    await expect(guard.canActivate(asContext(req))).rejects.toBeInstanceOf(TransformFileAuthRedirectException);
  });

  it('redirects to login when the Redis token does not match the request token', async () => {
    redisGet.mockResolvedValue('a-newer-token');
    const { guard } = makeGuard();
    const req = buildRequest({ cookies: { access_token: 'stale-token' } });

    await expect(guard.canActivate(asContext(req))).rejects.toBeInstanceOf(TransformFileAuthRedirectException);
  });

  it('bypasses auth in development when no header and no cookie present', async () => {
    process.env.NODE_ENV = 'development';
    const { guard, verify } = makeGuard();
    const req = buildRequest();

    await expect(guard.canActivate(asContext(req))).resolves.toBe(true);
    expect(req.info?.client).toBe('user');
    expect(verify).not.toHaveBeenCalled();
  });

  it('does NOT bypass in development when a cookie is present', async () => {
    process.env.NODE_ENV = 'development';
    redisGet.mockResolvedValue('real-token');
    const { guard, verify } = makeGuard();
    const req = buildRequest({ cookies: { access_token: 'real-token' } });

    await expect(guard.canActivate(asContext(req))).resolves.toBe(true);
    expect(verify).toHaveBeenCalledWith('real-token', { secret: 'test-secret' });
  });
});
