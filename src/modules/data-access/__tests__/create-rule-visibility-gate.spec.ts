import { PermissionCacheService } from '@common/authorization';
import { SCOPE_TYPE } from '@common/enums';
import { ChangeHistoryLogger } from '@modules/change-history/change-history-logger.service';
import { ForbiddenException } from '@nestjs/common';
import { UserType } from '@modules/databases/user.entity';
import { DataSource, Repository } from 'typeorm';
import { DataAccessService } from '../data-access.service';
import { HierarchyValidationService } from '../hierarchy-validation.service';
import { CallerContext, ManageAuthorityService } from '../helpers/manage-authority.helper';
import { DataAccessRepository } from '../repository/data-access.repository';
import { RecordPathService } from '../services/record-path.service';
import { CreateDataAccessDto } from '../dto/create-data-access.dto';

// Rule-target tables outside MANAGE_ENABLED_MODULES — the records-visibility gate must now
// cover these (previously the gate no-op'd for them → the reported hole).
const OWNER_CHAIN_TABLE = 'bi_payment_programs'; // owner-chain, not manage-enabled
const OWN_ALL_TABLE = 'ma_tool_cstb_rpt_properties'; // whole-table SO (OWNER_ALL_TABLES)

/**
 * Harness mirroring data-access-write-gate.spec.ts, plus:
 *  - `queryResults`: sequential responses for `connection.query` (own-all role lookup + sentinel probe)
 *  - `superAdmin`: drives the usersRepo row so checkSuperAdmin resolves true/false
 */
function makeService(opts: {
  tableName: string;
  manageable?: (recordId: number) => boolean;
  queryResults?: any[];
  superAdmin?: boolean;
  findOne?: jest.Mock;
}) {
  const manageable = opts.manageable ?? (() => true);
  const filterManageableRecords = jest.fn(async (_c: CallerContext, _t: string, ids: number[]) =>
    ids.filter((id) => manageable(id)),
  );
  const canManageRecord = jest.fn(async () => true);
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

  let callIndex = 0;
  const queryMock = jest.fn(() => Promise.resolve(opts.queryResults?.[callIndex++] ?? []));
  const dataSource = { query: queryMock, transaction } as unknown as DataSource;

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
  const usersRepo = {
    findOne: jest.fn().mockResolvedValue({ id: 5, type: opts.superAdmin ? UserType.SUPER_ADMIN : 'staff' }),
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
  return { service, filterManageableRecords, queryMock };
}

const CALLER: CallerContext = { userId: 5, isSuperAdmin: false, client: 'user' };
const baseDto = (data_ids: number[]): CreateDataAccessDto => ({
  data_ids,
  module_id: 8,
  scope_type: SCOPE_TYPE.ALLOW,
  user_permissions: [{ user_id: 9, permission_ids: [1] }],
});

const ruleRecord = (table: string) => ({
  id: 100,
  data_id: 7,
  module_id: 8,
  module: { table_name: table },
  scope_type: SCOPE_TYPE.ALLOW,
  role_data_access: [],
  user_data_access: [],
});

describe('Create-rule visibility gate (all RULE_TARGET_TABLES)', () => {
  // ── Hole closed: owner-chain rule-target table now gated ────────────────────
  it('create on owner-chain table: caller manages none → 403 (hole closed)', async () => {
    const { service } = makeService({ tableName: OWNER_CHAIN_TABLE, manageable: () => false });
    await expect(service.create(baseDto([1]), 'u', { id: 5 }, 'user')).rejects.toThrow('not_record_manager');
  });

  it('create on owner-chain table: caller manages all → OK, gated with create-verb', async () => {
    const { service, filterManageableRecords } = makeService({ tableName: OWNER_CHAIN_TABLE, manageable: () => true });
    await expect(service.create(baseDto([1, 2]), 'u', { id: 5 }, 'user')).resolves.toBeDefined();
    expect(filterManageableRecords).toHaveBeenCalledWith(CALLER, OWNER_CHAIN_TABLE, [1, 2], 'perm_data_access_create', {
      bypassCache: true,
    });
  });

  it('create: all-or-nothing on owner-chain table → 403 when one id unmanageable', async () => {
    const { service } = makeService({ tableName: OWNER_CHAIN_TABLE, manageable: (id) => id === 1 });
    await expect(service.create(baseDto([1, 2]), 'u', { id: 5 }, 'user')).rejects.toThrow(ForbiddenException);
  });

  // ── Verb-per-action: delete/removeLink gate on the delete verb ──────────────
  it('delete on owner-chain table: gated with delete-verb (not create)', async () => {
    const findOne = jest.fn().mockResolvedValue(ruleRecord(OWNER_CHAIN_TABLE));
    const { service, filterManageableRecords } = makeService({
      tableName: OWNER_CHAIN_TABLE,
      manageable: () => true,
      findOne,
    });
    await service.delete(100, 'u', { id: 5 }, 'user');
    expect(filterManageableRecords).toHaveBeenCalledWith(CALLER, OWNER_CHAIN_TABLE, [7], 'perm_data_access_delete', {
      bypassCache: true,
    });
  });

  it('removeLink on owner-chain table: gated with delete-verb; unmanageable → 403', async () => {
    const findOne = jest.fn().mockResolvedValue(ruleRecord(OWNER_CHAIN_TABLE));
    const { service, filterManageableRecords } = makeService({
      tableName: OWNER_CHAIN_TABLE,
      manageable: () => false,
      findOne,
    });
    await expect(service.removeLink(100, 'user', 9, 'u', { id: 5 }, 'user')).rejects.toThrow('not_record_manager');
    expect(filterManageableRecords).toHaveBeenCalledWith(CALLER, OWNER_CHAIN_TABLE, [7], 'perm_data_access_delete', {
      bypassCache: true,
    });
  });

  it('update on owner-chain table: gated with create-verb', async () => {
    const findOne = jest.fn().mockResolvedValue(ruleRecord(OWNER_CHAIN_TABLE));
    const { service, filterManageableRecords } = makeService({
      tableName: OWNER_CHAIN_TABLE,
      manageable: () => true,
      findOne,
    });
    await service.update(100, {}, 'u', { id: 5 }, 'user');
    expect(filterManageableRecords).toHaveBeenCalledWith(CALLER, OWNER_CHAIN_TABLE, [7], 'perm_data_access_create', {
      bypassCache: true,
    });
  });

  // ── Own-all sentinel table: resolved via hasOwnerAllAssignment (real code) ───
  it('create on own-all table: caller holds sentinel SO row → OK (no id allow-list)', async () => {
    const { service, filterManageableRecords } = makeService({
      tableName: OWN_ALL_TABLE,
      // queryResults: [0] role lookup → role 3, [1] sentinel probe → owner
      queryResults: [[{ role_id: 3 }], [{ '?column?': 1 }]],
    });
    await expect(service.create(baseDto([1, 2]), 'u', { id: 5 }, 'user')).resolves.toBeDefined();
    // own-all short-circuits before the per-record filter
    expect(filterManageableRecords).not.toHaveBeenCalled();
  });

  it('create on own-all table: caller lacks sentinel SO row → 403', async () => {
    const { service } = makeService({
      tableName: OWN_ALL_TABLE,
      queryResults: [[{ role_id: 3 }], []], // sentinel probe → not an owner
    });
    await expect(service.create(baseDto([1]), 'u', { id: 5 }, 'user')).rejects.toThrow('not_record_manager');
  });

  // ── super_admin bypass ──────────────────────────────────────────────────────
  it('create: super_admin on owner-chain table → OK even when filter would deny', async () => {
    const { service, filterManageableRecords } = makeService({
      tableName: OWNER_CHAIN_TABLE,
      manageable: () => false,
      superAdmin: true,
    });
    await expect(service.create(baseDto([1]), 'u', { id: 5 }, 'user')).resolves.toBeDefined();
    expect(filterManageableRecords).not.toHaveBeenCalled();
  });

  // ── Internal caller (no HTTP context) stays ungated ─────────────────────────
  it('create: no caller (internal) → no gate', async () => {
    const { service, filterManageableRecords } = makeService({ tableName: OWNER_CHAIN_TABLE, manageable: () => false });
    await expect(service.create(baseDto([1]), 'u')).resolves.toBeDefined();
    expect(filterManageableRecords).not.toHaveBeenCalled();
  });
});
