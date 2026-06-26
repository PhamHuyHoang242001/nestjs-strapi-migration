import { RedisKey, USER_CLIENT } from '@common/enums';
import { RedisAdapter } from '@common/infrastructure/redis.adapter';
import { RequestWithInfo } from '@common/types/request-with-info';
import { FRONTEND_BASE_URL, PUBLIC_BASE_URL } from '@configuration/env.config';
import { AUTH_FAIL } from '@constant/index';
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { TransformFileAuthRedirectException } from './transform-file-auth-redirect.exception';

// Cookie the frontend sets after login. Browser-pasted links cannot send an
// Authorization header, so the token must be read from this cookie.
const USER_TOKEN_COOKIE = 'access_token';

interface JwtPayload {
  id: number;
  [key: string]: unknown;
}

/**
 * Auth guard for the (user) transform-file endpoint. Mirrors the standard repo's
 * BearerGuard validation — verify the JWT, then confirm the token matches the
 * user's current token stored in Redis (allowlist) — but resolves the token from
 * the Authorization header OR the `access_token` cookie (header wins) so links
 * opened directly in a browser still authenticate, and on any auth failure it
 * redirects to login rather than returning a JSON 401.
 */
@Injectable()
export class TransformFileAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithInfo>();

    // DEV MODE: skip auth and inject a default user when no credentials present.
    if (process.env.NODE_ENV === 'development' && !req.headers.authorization && !this.readCookieToken(req)) {
      if (!req.info) req.info = {};
      req.info.user = { id: 1, username: 'user01', client: 'user' } as any;
      req.info.client = 'user';
      req.info.ip = '';
      req.info.url = req.originalUrl;
      return true;
    }

    if (!req.info) req.info = {};
    req.info.language = req.headers['accept-language'];

    const token = this.resolveToken(req);
    if (!token) throw new TransformFileAuthRedirectException(this.buildLoginUrl(req));

    try {
      const payload = this.jwtService.verify<JwtPayload>(token, {
        secret: this.configService.get('JWT_SECRET'),
      });

      // Allowlist: token is valid only if it matches the user's current token in Redis.
      const isExistToken = await RedisAdapter.get(`${RedisKey.USER_TOKEN}_${payload.id}`);
      if (!isExistToken || isExistToken !== token) throw new UnauthorizedException(AUTH_FAIL);

      req.info.user = payload;
      req.info.client = USER_CLIENT.USER;
      req.info.ip = (req.headers.ip as string) || '';
      req.info.url = req.originalUrl;

      return true;
    } catch {
      // JWT invalid/expired or token not the current one → send browser to login.
      throw new TransformFileAuthRedirectException(this.buildLoginUrl(req));
    }
  }

  /** Authorization header first (Bearer), then the access_token cookie. */
  private resolveToken(req: RequestWithInfo): string | undefined {
    const [scheme, authorization] = (req.headers.authorization || '').split(' ');
    if (scheme === 'Bearer' && authorization) return authorization;
    return this.readCookieToken(req);
  }

  private readCookieToken(req: RequestWithInfo): string | undefined {
    const cookies = (req.cookies || {}) as Record<string, string>;
    return cookies[USER_TOKEN_COOKIE];
  }

  /**
   * Login URL with the current request as the post-login return target.
   *
   * The return URL is built from the configured public origin, not from
   * `req.protocol`/`req.get('host')`: behind an ingress the pod sees plain http
   * and the internal service host, which would make the post-login redirect
   * point at an unreachable cluster-internal address. PUBLIC_BASE_URL carries
   * the public scheme, host, and any gateway path prefix (e.g. `/v2`) that the
   * ingress strips before the request reaches the app.
   */
  private buildLoginUrl(req: RequestWithInfo): string {
    const returnUrl = `${PUBLIC_BASE_URL}${req.originalUrl}`;
    return `${FRONTEND_BASE_URL}/login?url=${encodeURIComponent(returnUrl)}`;
  }
}
