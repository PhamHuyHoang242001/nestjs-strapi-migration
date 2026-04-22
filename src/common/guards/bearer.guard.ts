import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

import { TOKEN_TYPE, USER_CLIENT } from '@common/enums';
import { encryptDevice } from '@common/utils';
import { RequestWithInfo } from '@common/types/request-with-info';
import { AUTH_FAIL } from '@constant/index';
import { TokenRepository } from '@modules/token/repository/token.repository';
import { UserRepository } from '@modules/users/repository/users.repository';
import { DataSource } from 'typeorm';
import { AdminRepository } from '@modules/admins/repository/admin.repository';

@Injectable()
export class BearerGuard implements CanActivate {
  constructor(
    private readonly tokenRepository: TokenRepository,
    private readonly userRepository: UserRepository,
    private readonly adminRepository: AdminRepository,

    private readonly connection: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithInfo>();

    // DEV MODE: skip auth and inject default admin user
    if (process.env.NODE_ENV === 'development' && !req.headers.authorization) {
      if (!req.info) req.info = {};
      req.info.user = { id: 1, username: 'admin01', client: 'admin' } as any;
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
        req.info.client = account?.client as string | undefined;
        break;
      }
      default:
        throw new UnauthorizedException(AUTH_FAIL);
    }

    req.info.ip = (req.headers.ip as string) || '';
    req.info.domain = domain;
    req.info.host = hostname;
    req.info.url = req.originalUrl;

    return true;
  }
}
