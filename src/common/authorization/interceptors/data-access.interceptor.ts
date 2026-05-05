import { CallHandler, ExecutionContext, ForbiddenException, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { RequestWithInfo } from '@common/types/request-with-info';
import { DATA_ACCESS_META_KEY } from '../constants/authorization.constant';
import { DataAccessMeta } from '../decorators/require-data-access.decorator';
import { PermissionCacheService } from '../services/permission-cache.service';

@Injectable()
export class DataAccessInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionCache: PermissionCacheService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const meta = this.reflector.getAllAndOverride<DataAccessMeta | undefined>(DATA_ACCESS_META_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!meta) return next.handle();

    const req = context.switchToHttp().getRequest<RequestWithInfo>();
    if (req.info?.client === 'admin') return next.handle();

    const userId = Number(req.info?.user?.id);
    if (!userId) throw new ForbiddenException('User not authenticated');

    req.info.accessibleDataIds = await this.permissionCache.getAccessibleRecords(
      userId,
      meta.tableName,
      meta.permissionCode,
    );

    return next.handle();
  }
}
