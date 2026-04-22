import { STATUS, TOKEN_TYPE, USER_CLIENT } from '@common/enums';
import { encryptDevice } from '@common/utils';
import { RequestWithInfo } from '@common/types/request-with-info';
import { CLIENT_TOKEN } from '@constant/auth';
import { AUTH_FAIL } from '@constant/index';
import { AdminRepository } from '@modules/admins/repository/admin.repository';
import { TokenRepository } from '@modules/token/repository/token.repository';
import { UserRepository } from '@modules/users/repository/users.repository';
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class DynamicAuthGuard implements CanActivate {
  constructor(
    private readonly tokenRepository: TokenRepository,
    private readonly userRepository: UserRepository,
    private readonly adminRepository: AdminRepository,

    private readonly connection: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithInfo>();
    const [scheme, authorization] = (req.headers.authorization || '').split(' ');
    const hostname = req.get('origin') ? `${req.get('origin')}/` : `${req.protocol}://${req.get('host')}/`;
    const domain = hostname.split('://')[1].split(':')[0];
    if (!req.info) req.info = {};
    req.info.device_hash = encryptDevice(domain, req.headers.device as object);
    req.info.language = req.headers['accept-language'];

    switch (scheme) {
      case 'Bearer': {
        const token = await this.tokenRepository.checkTokenValid(authorization, [
          TOKEN_TYPE.LOGIN,
          TOKEN_TYPE.REFRESH_TOKEN,
        ]);
        req.info.client = token?.client;
        let account: Record<string, unknown> | undefined;
        if ((token?.client as USER_CLIENT) === USER_CLIENT.USER) {
          account = (await this.userRepository.findOneByCondition({
            id: token.user_id,
            status: STATUS.ACTIVE,
          })) as unknown as Record<string, unknown>;
        } else if ((token?.client as USER_CLIENT) === USER_CLIENT.ADMIN) {
          account = (await this.adminRepository.findOneByCondition({
            id: token.admin_id,
            status: STATUS.ACTIVE,
          })) as unknown as Record<string, unknown>;
        }
        if (!account) throw new UnauthorizedException(AUTH_FAIL);
        req.info.user = account;
        req.info.client = null;
        break;
      }
      case 'Basic': {
        const token = CLIENT_TOKEN.find((u) => u.token == authorization);
        if (!token) throw new UnauthorizedException(AUTH_FAIL);
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
