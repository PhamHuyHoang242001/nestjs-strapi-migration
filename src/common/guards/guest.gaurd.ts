import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { USER_CLIENT, USER_STATUS } from '@common/enums';
import { encryptDevice } from '@common/utils';
import { RequestWithInfo } from '@common/types/request-with-info';
import { AUTH_FAIL } from '@constant/index';
import { UserRepository } from '@modules/users/repository/users.repository';
import { DataSource } from 'typeorm';

@Injectable()
export class GuestGuard implements CanActivate {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly connection: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithInfo>();
    const guest_id = (req.headers['guest-id'] as string | undefined)?.trim();
    const hostname = req.get('origin') ? `${req.get('origin')}/` : `${req.protocol}://${req.get('host')}/`;
    const domain = hostname.split('://')[1].split(':')[0];
    if (!req.info) req.info = {};
    req.info.device_hash = encryptDevice(domain, req.headers.device as object);
    req.info.language = req.headers['accept-language'];

    if (!guest_id) throw new UnauthorizedException(AUTH_FAIL);
    let user = await this.userRepository.findOneBy({ guest_id, is_registered: false });
    if (!user) {
      user = await this.userRepository.save({ guest_id, status: USER_STATUS.ANONYMOUS, is_registered: false });
    }
    if (user) {
      req.info.user = user as unknown as Record<string, unknown>;
    } else {
      req.info.user = {
        id: null,
        guest_id,
      };
    }
    req.info.client = USER_CLIENT.USER;

    req.info.ip = (req.headers.ip as string) || '';
    req.info.domain = domain;
    req.info.host = hostname;
    req.info.url = req.originalUrl;

    return true;
  }
}
