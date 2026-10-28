import { Reflector } from '@nestjs/core';
import { DataHubAccessService } from '../data-hub-access.service';
import { DH_PERMISSIONS } from '../data-hub-permission-codes';
import {
  DataHubPermissionGuard,
  RequireDataHubPermission,
  RequireDataHubSuperAdmin,
} from '../data-hub-permission.guard';

class Target {
  open() {}
  @RequireDataHubPermission(DH_PERMISSIONS.CONSUMER_CREATE)
  create() {}
  @RequireDataHubPermission(DH_PERMISSIONS.DATA_SERVICE_CREATE, DH_PERMISSIONS.DATA_SERVICE_UPDATE)
  both() {}
  @RequireDataHubSuperAdmin()
  importFile() {}
}

const ctx = (handler: keyof Target, user: Record<string, unknown>, client = 'user') =>
  ({
    getHandler: () => Target.prototype[handler],
    getClass: () => Target,
    switchToHttp: () => ({ getRequest: () => ({ info: { user, client } }) }),
  }) as never;

const guardWith = (codes: string[]) => {
  const access = new DataHubAccessService(
    { query: jest.fn() } as never,
    {
      getPermissions: jest.fn().mockResolvedValue(new Set(codes)),
    } as never,
  );
  return new DataHubPermissionGuard(new Reflector(), access);
};

describe('DataHubPermissionGuard', () => {
  const user = { id: 7, type: 'user' };
  const superAdmin = { id: 1, type: 'super_admin' };

  it('leaves handlers without metadata open', async () => {
    await expect(guardWith([]).canActivate(ctx('open', user))).resolves.toBe(true);
  });

  it('requires the code; 403 names the missing code', async () => {
    await expect(guardWith([DH_PERMISSIONS.CONSUMER_CREATE]).canActivate(ctx('create', user))).resolves.toBe(true);
    await expect(guardWith([]).canActivate(ctx('create', user))).rejects.toThrow(
      'PERMISSION_DENIED: dh_consumer_create',
    );
  });

  it('requires every listed code (AND)', async () => {
    await expect(guardWith([DH_PERMISSIONS.DATA_SERVICE_CREATE]).canActivate(ctx('both', user))).rejects.toThrow(
      'dh_data_service_update',
    );
  });

  it('super_admin passes everything; super-admin-only rejects others before the handler', async () => {
    await expect(guardWith([]).canActivate(ctx('create', superAdmin))).resolves.toBe(true);
    await expect(guardWith([]).canActivate(ctx('importFile', superAdmin))).resolves.toBe(true);
    await expect(guardWith(Object.values(DH_PERMISSIONS)).canActivate(ctx('importFile', user))).rejects.toThrow(
      'SUPER_ADMIN_ONLY',
    );
  });

  it('an admin-client token gets no codes', async () => {
    await expect(guardWith([DH_PERMISSIONS.CONSUMER_CREATE]).canActivate(ctx('create', user, 'admin'))).rejects.toThrow(
      'PERMISSION_DENIED',
    );
  });

  it('rejects a request without a user', async () => {
    await expect(guardWith([]).canActivate(ctx('create', {}))).rejects.toThrow('User not authenticated');
  });
});
