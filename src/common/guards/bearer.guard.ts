import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { TOKEN_TYPE, USER_CLIENT } from '@common/enums';
import { encryptDevice } from '@common/utils';
import { RequestWithInfo } from '@common/types/request-with-info';
import { AUTH_FAIL } from '@constant/index';
import { TokenRepository } from '@modules/token/repository/token.repository';
import { UserRepository } from '@modules/users/repository/users.repository';
import { DataSource } from 'typeorm';
import { AdminRepository } from '@modules/admins/repository/admin.repository';
import { UserType } from '@modules/databases/user.entity';
import {
  PORTAL_VIEW_PERMISSION,
  SKIP_PORTAL_PERMISSION_META_KEY,
} from '@common/authorization/constants/authorization.constant';
import { PermissionCacheService } from '@common/authorization/services/permission-cache.service';

export const PORTAL_ACCESS_DENIED = `PORTAL_ACCESS_DENIED: missing permission ${PORTAL_VIEW_PERMISSION}`;

@Injectable()
export class BearerGuard implements CanActivate {
  constructor(
    private readonly tokenRepository: TokenRepository,
    private readonly userRepository: UserRepository,
    private readonly adminRepository: AdminRepository,

    private readonly connection: DataSource,
    private readonly reflector: Reflector,
    private readonly permissionCache: PermissionCacheService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithInfo>();

    // DEV MODE: skip auth and inject default admin user.
    // type 'super_admin' lets the injected identity clear PermissionGuard so the FE can
    // exercise permission-gated endpoints without a token in local development. Only active
    // when NODE_ENV=development and no Authorization header is present; real tokens are still
    // fully authenticated and permission-checked.
    if (process.env.NODE_ENV === 'development' && !req.headers.authorization) {
      if (!req.info) req.info = {};
      req.info.user = { id: 1, username: 'admin01', client: 'admin', type: 'super_admin' } as any;
      req.info.client = 'admin';
      req.info.ip = '';
      req.info.domain = 'localhost';
      req.info.host = 'http://localhost:3002/';
      req.info.url = req.originalUrl;
      return true;
    }

    const [scheme, authorization] = (req.headers.authorization || '').split(' ');
    const hostname = req.get('origin') ? `${req.get('origin')}/` : `${req.protocol}://${req.get('host')}/`;
    const domain = hostname.split('://')[1].split(':')[0];
    if (!req.info) req.info = {};
    req.info.device_hash = encryptDevice(domain, req.headers.device as object);
    req.info.language = req.headers['accept-language'];

    switch (scheme) {
      case 'Bearer': {
        const { admin_id, user_id, client } = await this.tokenRepository.checkTokenValid(authorization, [
          TOKEN_TYPE.LOGIN,
        ]);

        let account: Record<string, unknown> | undefined;
        if ((client as USER_CLIENT) === USER_CLIENT.USER) {
          account = (await this.userRepository.checkUserValid({ id: user_id })) as unknown as Record<string, unknown>;
        } else if ((client as USER_CLIENT) === USER_CLIENT.ADMIN) {
          account = (await this.adminRepository.checkAdminValid({
            id: admin_id,
          })) as unknown as Record<string, unknown>;
        }
        req.info.user = account;
        // client comes from the login token, not the account row (users/admins tables have
        // no `client` column). Without this, IsAdminGuard/IsUserGuard reject every real token.
        req.info.client = client;
        break;
      }
      default:
        throw new UnauthorizedException(AUTH_FAIL);
    }

    req.info.ip = (req.headers.ip as string) || '';
    req.info.domain = domain;
    req.info.host = hostname;
    req.info.url = req.originalUrl;

    await this.checkPortalAccess(context, req);
    return true;
  }

  // Every portal API requires the portal permission on top of its own checks. Only super_admin skips it;
  // admin-client tokens hold no role permissions, so they are rejected like any user without the grant.
  private async checkPortalAccess(context: ExecutionContext, req: RequestWithInfo): Promise<void> {
    const user = req.info.user;
    if (user?.type === UserType.SUPER_ADMIN) {
      req.info.hasPortalAccess = true;
      return;
    }
    const userId = Number(user?.id);
    req.info.hasPortalAccess =
      (req.info.client as USER_CLIENT) === USER_CLIENT.USER &&
      userId > 0 &&
      (await this.permissionCache.hasPermission(userId, PORTAL_VIEW_PERMISSION));
    if (req.info.hasPortalAccess) return;

    const skip = this.reflector.getAllAndOverride<boolean | undefined>(SKIP_PORTAL_PERMISSION_META_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!skip) throw new ForbiddenException(PORTAL_ACCESS_DENIED);
  }
}
