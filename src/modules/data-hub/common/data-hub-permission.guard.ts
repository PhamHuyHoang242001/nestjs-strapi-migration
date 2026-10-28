import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RequestWithInfo } from '@common/types/request-with-info';
import { dataHubCaller } from './data-hub-caller.util';
import { DataHubAccessService } from './data-hub-access.service';
import { DataHubPermissionCode } from './data-hub-permission-codes';

export const DATA_HUB_PERMISSION_KEY = 'data_hub_permission';
export const DATA_HUB_SUPER_ADMIN_KEY = 'data_hub_super_admin';

// The caller must hold every listed code (super_admin passes).
export const RequireDataHubPermission = (...codes: DataHubPermissionCode[]) =>
  SetMetadata(DATA_HUB_PERMISSION_KEY, codes);

// Only super_admin. Checked by the guard, so it runs before interceptors such as a file upload.
export const RequireDataHubSuperAdmin = () => SetMetadata(DATA_HUB_SUPER_ADMIN_KEY, true);

// Data Hub write gate. It uses DataHubAccessService instead of the generic PermissionGuard so the API and
// the flags returned by my-permissions / is_update follow exactly the same rule (explicit codes of
// user-client callers, super_admin bypass). Handlers without metadata are left open (reads).
@Injectable()
export class DataHubPermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: DataHubAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const superOnly = this.reflector.getAllAndOverride<boolean | undefined>(DATA_HUB_SUPER_ADMIN_KEY, targets);
    const codes = this.reflector.getAllAndOverride<DataHubPermissionCode[] | undefined>(
      DATA_HUB_PERMISSION_KEY,
      targets,
    );
    if (!superOnly && !codes?.length) return true;

    const caller = dataHubCaller(context.switchToHttp().getRequest<RequestWithInfo>());
    if (superOnly) {
      this.access.assertSuperAdmin(caller);
      return true;
    }
    for (const code of codes ?? []) {
      if (!(await this.access.hasCode(caller, code))) throw new ForbiddenException(`PERMISSION_DENIED: ${code}`);
    }
    return true;
  }
}
