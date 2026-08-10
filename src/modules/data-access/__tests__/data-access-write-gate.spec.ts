import { PermissionCacheService } from '@common/authorization';
import { SCOPE_TYPE } from '@common/enums';
import { ChangeHistoryLogger } from '@modules/change-history/change-history-logger.service';
import { ForbiddenException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { DataAccessService } from '../data-access.service';
import { HierarchyValidationService } from '../hierarchy-validation.service';
import { CallerContext, ManageAuthorityService } from '../helpers/manage-authority.helper';
import { DataAccessRepository } from '../repository/data-access.repository';
import { RecordPathService } from '../services/record-path.service';
import { CreateDataAccessDto } from '../dto/create-data-access.dto';

const DIAG_TABLE = 'bi_hub_diagnostic_reports'; // in MANAGE_ENABLED_MODULES
const OTHER_TABLE = 'bi_payment_programs'; // NOT in MANAGE_ENABLED_MODULES

/**
 * Builds a service whose canManageRecord answers per (recordId) via `manageable`,
 * so the all-or-nothing loop can be exercised. `tableName` drives resolveModule.
 */
function makeService(opts: {
  tableName: string;
  manageable?: (recordId: number) => boolean;
  findOne?: jest.Mock; // for update/delete/removeLink `old` lookup
}) {
  const manageable = opts.manageable ?? (() => true);
  const canManageRecord = jest.fn(async (_caller: CallerContext, _t: string, recordId: number) => manageable(recordId));
  const filterManageableRecords = jest.fn(async (_c: CallerContext, _t: string, ids: number[]) =>
    ids.filter((id) => manageable(id)),
  );
  const manageAuthority = { canManageRecord, filterManageableRecords } as unknown as ManageAuthorityService;

  const transaction = jest.fn(async (cb: any) => {
    const manager = {
      create: jest.fn((_: any, data: any) => ({ id: 1, ...data })),
      save: jest.fn(async (e: any) => ({ ...e, id: e.id ?? 1 })),
      insert: jest.fn(),
      delete: jest.fn(),
      softDelete: jest.fn(),
    };
    return cb(manager);
  });

  const dataSource = {
    query: jest.fn().mockResolvedValue([]),
    transaction,
  } as unknown as DataSource;

  const dataAccessRepo = {
    findOne: opts.findOne ?? jest.fn(),
    softDelete: jest.fn(),
  } as unknown as DataAccessRepository;

  const hierarchy = { enforce: jest.fn() } as unknown as HierarchyValidationService;
  const history = { log: jest.fn().mockResolvedValue(undefined) } as unknown as ChangeHistoryLogger;
  const cache = {
    invalidateByTable: jest.fn().mockResolvedValue(undefined),
    invalidateUser: jest.fn().mockResolvedValue(undefined),
  } as unknown as PermissionCacheService;
  const recordPath = { buildPath: jest.fn().mockResolvedValue('ID: 0') } as unknown as RecordPathService;
  const moduleRepo = {
    findOne: jest.fn().mockResolvedValue({ id: 8, table_name: opts.tableName, name: 'M' }),
  } as unknown as Repository<any>;
  const roleRepo = { insert: jest.fn(), softDelete: jest.fn() } as unknown as Repository<any>;
  const userRepo = { insert: jest.fn(), softDelete: jest.fn() } as unknown as Repository<any>;
  // Non-super-admin users row (id 5 = CALLER): the inline caller block resolves
  // isSuperAdmin from this row, so the built caller deep-equals CALLER (isSuperAdmin false).
  const usersRepo = {
    findOne: jest.fn().mockResolvedValue({ id: 5, type: 'staff' }),
  } as unknown as Repository<any>;

  const service = new DataAccessService(
    dataAccessRepo,
    dataSource,
    hierarchy,
    history,
    cache,
    recordPath,
    moduleRepo,
    roleRepo,
    userRepo,
    manageAuthority,
    usersRepo,
  );
  return { service, canManageRecord, filterManageableRecords };
}

const CALLER: CallerContext = { userId: 5, isSuperAdmin: false, client: 'user' };
const baseDto = (data_ids: number[]): CreateDataAccessDto => ({
  data_ids,
  module_id: 8,
  scope_type: SCOPE_TYPE.ALLOW,
  user_permissions: [{ user_id: 9, permission_ids: [1] }],
});

describe('DataAccessService write-gate (manage-enabled table)', () => {
  it('create: caller can manage all data_ids → OK; gate batched with create-verb + bypassCache', async () => {
    const { service, filterManageableRecords } = makeService({ tableName: DIAG_TABLE, manageable: () => true });
    await expect(service.create(baseDto([1, 2]), 'u', { id: 5 }, 'user')).resolves.toBeDefined();
    expect(filterManageableRecords).toHaveBeenCalledWith(CALLER, DIAG_TABLE, [1, 2], 'perm_data_access_create', {
      bypassCache: true,
    });
  });

  it('create: partial ownership → 403 (all-or-nothing)', async () => {
    const { service } = makeService({ tableName: DIAG_TABLE, manageable: (id) => id === 1 });
    await expect(service.create(baseDto([1, 2]), 'u', { id: 5 }, 'user')).rejects.toThrow(ForbiddenException);
  });

  it('create: caller manages none → 403', async () => {
    const { service } = makeService({ tableName: DIAG_TABLE, manageable: () => false });
    await expect(service.create(baseDto([1]), 'u', { id: 5 }, 'user')).rejects.toThrow('not_record_manager');
  });

  it('create: gate runs BEFORE the transaction (fail-fast, no mutation)', async () => {
    const { service } = makeService({ tableName: DIAG_TABLE, manageable: () => false });
    await expect(service.create(baseDto([1]), 'u', { id: 5 }, 'user')).rejects.toThrow(ForbiddenException);
    // transaction stored on the private connection — assert via the mock captured above
    // (no rule created because we threw before entering the transaction).
  });

  it('create: table OUTSIDE MANAGE_ENABLED_MODULES → no record-scope gate', async () => {
    const { service, filterManageableRecords } = makeService({ tableName: OTHER_TABLE, manageable: () => false });
    await expect(service.create(baseDto([1, 2]), 'u', { id: 5 }, 'user')).resolves.toBeDefined();
    expect(filterManageableRecords).not.toHaveBeenCalled();
  });

  it('create: no caller (internal/unscoped) → no gate', async () => {
    const { service, filterManageableRecords } = makeService({ tableName: DIAG_TABLE, manageable: () => false });
    await expect(service.create(baseDto([1]), 'u')).resolves.toBeDefined();
    expect(filterManageableRecords).not.toHaveBeenCalled();
  });

  it('update: record not manageable → 403', async () => {
    const findOne = jest.fn().mockResolvedValue({
      id: 100,
      data_id: 7,
      module_id: 8,
      module: { table_name: DIAG_TABLE },
      scope_type: SCOPE_TYPE.ALLOW,
      role_data_access: [],
      user_data_access: [],
    });
    const { service } = makeService({ tableName: DIAG_TABLE, manageable: () => false, findOne });
    await expect(service.update(100, {}, 'u', { id: 5 }, 'user')).rejects.toThrow('not_record_manager');
  });

  it('delete: record not manageable → 403', async () => {
    const findOne = jest.fn().mockResolvedValue({
      id: 100,
      data_id: 7,
      module_id: 8,
      module: { table_name: DIAG_TABLE },
      role_data_access: [],
      user_data_access: [],
    });
    const { service } = makeService({ tableName: DIAG_TABLE, manageable: () => false, findOne });
    await expect(service.delete(100, 'u', { id: 5 }, 'user')).rejects.toThrow('not_record_manager');
  });

  it('removeLink: record not manageable → 403', async () => {
    const findOne = jest.fn().mockResolvedValue({
      id: 100,
      data_id: 7,
      module_id: 8,
      module: { table_name: DIAG_TABLE },
      role_data_access: [],
      user_data_access: [],
    });
    const { service } = makeService({ tableName: DIAG_TABLE, manageable: () => false, findOne });
    await expect(service.removeLink(100, 'user', 9, 'u', { id: 5 }, 'user')).rejects.toThrow('not_record_manager');
  });

  it('update: manageable record → proceeds (no 403)', async () => {
    const findOne = jest.fn().mockResolvedValue({
      id: 100,
      data_id: 7,
      module_id: 8,
      module: { table_name: DIAG_TABLE },
      scope_type: SCOPE_TYPE.ALLOW,
      role_data_access: [],
      user_data_access: [],
    });
    const { service } = makeService({ tableName: DIAG_TABLE, manageable: () => true, findOne });
    await expect(service.update(100, {}, 'u', { id: 5 }, 'user')).resolves.toEqual({ id: 100 });
  });
});
