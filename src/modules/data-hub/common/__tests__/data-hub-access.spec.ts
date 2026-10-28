import { ForbiddenException } from '@nestjs/common';
import { DataHubAccessController } from '../data-hub-access.controller';
import { DataHubAccessService } from '../data-hub-access.service';
import { DH_PERMISSIONS } from '../data-hub-permission-codes';

const makeService = (codes: string[], memberRows: Array<{ department_id: number }> = []) => {
  const getPermissions = jest.fn().mockResolvedValue(new Set(codes));
  const query = jest.fn().mockResolvedValue(memberRows);
  const service = new DataHubAccessService({ query } as never, { getPermissions } as never);
  return { service, getPermissions, query };
};

const SUPER = { id: 1, type: 'super_admin' };
const USER = { id: 7, type: 'user', client: 'user' };
const ADMIN_CLIENT = { id: 7, client: 'admin' };

describe('DataHubAccessService.myPermissions', () => {
  it('super_admin gets every flag without reading codes', async () => {
    const { service, getPermissions } = makeService([]);
    const res = await service.myPermissions(SUPER);
    expect(res).toEqual({
      is_super_admin: true,
      consumer: { create: true, update: true },
      logical_term: { create: true, update: true },
      data_service: { create: true, update: true },
      department: { view: true, create: true, update: true, delete: true },
    });
    expect(getPermissions).not.toHaveBeenCalled();
  });

  it('a normal user only gets the flags of the codes it holds', async () => {
    const { service } = makeService([DH_PERMISSIONS.CONSUMER_CREATE, DH_PERMISSIONS.DEPARTMENT_VIEW, 'other']);
    const res = await service.myPermissions(USER);
    expect(res.is_super_admin).toBe(false);
    expect(res.consumer).toEqual({ create: true, update: false });
    expect(res.department).toEqual({ view: true, create: false, update: false, delete: false });
    expect(res).not.toHaveProperty('physical_term');
    expect(res.data_service).toEqual({ create: false, update: false });
  });
});

describe('DataHubAccessService checks', () => {
  it('assertSuperAdmin rejects everyone else with SUPER_ADMIN_ONLY', () => {
    const { service } = makeService([]);
    expect(() => service.assertSuperAdmin(SUPER)).not.toThrow();
    expect(() => service.assertSuperAdmin(USER)).toThrow('SUPER_ADMIN_ONLY');
  });

  it('an admin-client token never borrows the codes of the user sharing its id', async () => {
    const { service, getPermissions } = makeService([DH_PERMISSIONS.CONSUMER_CREATE]);
    await expect(service.hasCode(ADMIN_CLIENT, DH_PERMISSIONS.CONSUMER_CREATE)).resolves.toBe(false);
    expect((await service.myPermissions(ADMIN_CLIENT)).consumer.create).toBe(false);
    expect(getPermissions).not.toHaveBeenCalled();
  });

  it('writableDepartmentIds: super_admin = all (null), no code = [], code = member departments', async () => {
    const holder = makeService([DH_PERMISSIONS.DATA_SERVICE_CREATE], [{ department_id: 3 }, { department_id: 5 }]);
    await expect(holder.service.writableDepartmentIds(SUPER, 'create')).resolves.toBeNull();
    await expect(holder.service.writableDepartmentIds(USER, 'create')).resolves.toEqual([3, 5]);
    await expect(holder.service.writableDepartmentIds(USER, 'update')).resolves.toEqual([]);
    const [firstSql] = holder.query.mock.calls[0] as [string];
    expect(firstSql).toContain('JOIN data_hub_departments d');
  });

  it('assertDepartmentWrite: every department must be a membership', async () => {
    const { service, query } = makeService([], [{ department_id: 3 }]);
    const manager = { query } as never;
    await expect(service.assertDepartmentWrite(USER, [3], manager)).resolves.toBeUndefined();
    await expect(service.assertDepartmentWrite(USER, [3, 4], manager)).rejects.toThrow('DEPARTMENT_FORBIDDEN');
    await expect(service.assertDepartmentWrite(SUPER, [99], manager)).resolves.toBeUndefined();
    // a service without a department belongs to nobody: only super_admin
    await expect(service.assertDepartmentWrite(USER, [3, null], manager)).rejects.toThrow('DEPARTMENT_FORBIDDEN');
    await expect(service.assertDepartmentWrite(USER, [null], manager)).rejects.toThrow('DEPARTMENT_FORBIDDEN');
    await expect(service.assertDepartmentWrite(SUPER, [null], manager)).resolves.toBeUndefined();
  });

  it('canUpdateDataService needs the update code and the department', async () => {
    const { service } = makeService([DH_PERMISSIONS.DATA_SERVICE_UPDATE], [{ department_id: 3 }]);
    await expect(service.canUpdateDataService(USER, 3)).resolves.toBe(true);
    await expect(service.canUpdateDataService(USER, 4)).resolves.toBe(false);
    await expect(service.canUpdateDataService(USER, null)).resolves.toBe(false);
    await expect(service.canUpdateDataService(SUPER, 4)).resolves.toBe(true);
  });

  it('hasCode: super_admin always, user by code', async () => {
    const { service } = makeService([DH_PERMISSIONS.LOGICAL_TERM_UPDATE]);
    await expect(service.hasCode(SUPER, DH_PERMISSIONS.CONSUMER_UPDATE)).resolves.toBe(true);
    await expect(service.hasCode(USER, DH_PERMISSIONS.LOGICAL_TERM_UPDATE)).resolves.toBe(true);
    await expect(service.hasCode(USER, DH_PERMISSIONS.CONSUMER_UPDATE)).resolves.toBe(false);
  });
});

describe('DataHubAccessController', () => {
  it('rejects a caller without a user', async () => {
    const controller = new DataHubAccessController({ myPermissions: jest.fn() } as never);
    await expect(controller.myPermissions({ info: { user: {} } } as never)).rejects.toThrow(ForbiddenException);
  });
});
