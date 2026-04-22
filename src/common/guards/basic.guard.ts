import { encryptDevice } from '@common/utils';
import { RequestWithInfo } from '@common/types/request-with-info';
import { CLIENT_TOKEN } from '@constant/auth';
import { AUTH_FAIL } from '@constant/index';
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class BasicGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RequestWithInfo>();

    const [scheme, authorization] = (req.headers.authorization || '').split(' ');
    const hostname = req.get('origin') ? `${req.get('origin')}/` : `${req.protocol}://${req.get('host')}/`;
    const domain = hostname.split('://')[1].split(':')[0];

    if (scheme != 'Basic') throw new UnauthorizedException(AUTH_FAIL);
    const token = CLIENT_TOKEN.find((u) => u.token == authorization);
    if (!token) throw new UnauthorizedException(AUTH_FAIL);
    if (!req.info) req.info = {};
    req.info.device_hash = encryptDevice(domain, req.headers.device as object);

    req.info.client = token.client;
    req.info.ip = (req.headers.ip as string) || '';
    req.info.domain = domain;
    req.info.host = hostname;
    req.info.url = req.originalUrl;
    req.info.language = req.headers['accept-language'];
    return true;
  }
}
