import { RequestWithInfo } from '@common/types/request-with-info';
import { AUTH_FAIL } from '@constant/index';
import { ServiceTokenService } from '@modules/service-token/service-token.service';
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

/**
 * Validates a service token (Bearer) and attaches `req.info.service`.
 * NestJS equivalent of the Strapi `authService` middleware.
 */
@Injectable()
export class ServiceTokenGuard implements CanActivate {
  constructor(private readonly serviceTokenService: ServiceTokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithInfo>();
    const token = (req.headers.authorization || '').split(' ')[1];
    if (!token) throw new UnauthorizedException(AUTH_FAIL);

    const decoded = await this.serviceTokenService.verifyServiceToken(token);
    if (!decoded) throw new UnauthorizedException(AUTH_FAIL);

    if (!req.info) req.info = {};
    req.info.service = {
      serviceId: decoded.payload.service_id,
      serviceCode: decoded.payload.service_code,
      ip: (req.headers['x-real-ip'] as string) || (req.headers.ip as string) || '',
    };
    return true;
  }
}
