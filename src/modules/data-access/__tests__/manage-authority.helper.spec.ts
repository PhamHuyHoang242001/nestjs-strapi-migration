import { PermissionCacheService } from '@common/authorization';
import { OwnerScopeResolverService } from '@common/authorization/services/owner-scope-resolver.service';
import { PermissionQueryService } from '@common/authorization/services/permission-query.service';
import { Module as ModuleEntity } from '@modules/databases/module.entity';
import { Permission } from '@modules/databases/permission.entity';
import { Repository } from 'typeorm';
import { isManageEnabledTable, MANAGE_ENABLED_MODULES } from '../constants/hierarchy-config';
import { ManageAuthorityService } from '../helpers/manage-authority.helper';

const TABLE = 'bi_hub_diagnostic_reports';
const EDIT_CODE = 'bh_diag_report_edit';
const VERB = 'perm_data_access_create';

function createService(
  overrides: {
    accessibleCache?: number[];
    accessibleDb?: number[];
    hasPermCache?: boolean;
    hasPermDb?: boolean;
    isInOwnedScope?: boolean;
    editCode?: string | null;
  } = {},
) {
  const permissionCache = {
    getAccessibleRecords: jest.fn().mockResolvedValue(overrides.accessibleCache ?? []),
    hasPermission: jest.fn().mockResolvedValue(overrides.hasPermCache ?? false),
  } as unknown as PermissionCacheService;

  const queryService = {
    getAccessibleRecords: jest.fn().mockResolvedValue(overrides.accessibleDb ?? []),
    hasPermission: jest.fn().mockResolvedValue(overrides.hasPermDb ?? false),
  } as unknown as PermissionQueryService;

  const ownerScope = {
    isInOwnedScope: jest.fn().mockResolvedValue(overrides.isInOwnedScope ?? false),
  } as unknown as OwnerScopeResolverService;

  const moduleRepo = {
    findOne: jest.fn().mockResolvedValue({ id: 8, table_name: TABLE }),
  } as unknown as Repository<ModuleEntity>;

  const editCode = overrides.editCode === undefined ? EDIT_CODE : overrides.editCode;
  const permissionRepo = {
    findOne: jest.fn().mockResolvedValue(editCode ? { code: editCode } : null),
  } as unknown as Repository<Permission>;

  const service = new ManageAuthorityService(permissionCache, queryService, ownerScope, moduleRepo, permissionRepo);
  return { service, permissionCache, queryService, ownerScope };
}

describe('MANAGE_ENABLED_MODULES config', () => {
  it('includes diagnostic and excludes descriptive/unknown tables', () => {
    expect(isManageEnabledTable(TABLE)).toBe(true);
    expect(isManageEnabledTable('bi_hub_reports')).toBe(false);
    expect(isManageEnabledTable('bi_payment_programs')).toBe(false);
    expect(isManageEnabledTable(undefined)).toBe(false);
  });

  it('is a subset of RULE_TARGET_TABLES', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { RULE_TARGET_TABLES } = require('../constants/hierarchy-config');
    for (const t of MANAGE_ENABLED_MODULES) {
      expect(RULE_TARGET_TABLES.has(t)).toBe(true);
    }
  });
});

describe('ManageAuthorityService.canManageRecord', () => {
  const superAdmin = { isSuperAdmin: true, userId: undefined, client: 'user' };
  const user = (id: number) => ({ isSuperAdmin: false, userId: id, client: 'user' });

  it('super_admin → true regardless, without querying ownership', async () => {
    const { service, permissionCache, ownerScope } = createService();
    await expect(service.canManageRecord(superAdmin, TABLE, 1, VERB)).resolves.toBe(true);
    expect(ownerScope.isInOwnedScope).not.toHaveBeenCalled();
    expect(permissionCache.getAccessibleRecords).not.toHaveBeenCalled();
  });

  it('SO of the record → true (verb not required)', async () => {
    const { service } = createService({ isInOwnedScope: true, hasPermCache: false });
    await expect(service.canManageRecord(user(5), TABLE, 1, VERB)).resolves.toBe(true);
  });

  it('edit-on-record ∧ verb → true', async () => {
    const { service } = createService({ accessibleCache: [1, 2], hasPermCache: true });
    await expect(service.canManageRecord(user(5), TABLE, 1, VERB)).resolves.toBe(true);
  });

  it('edit-on-record but NOT verb → false', async () => {
    const { service } = createService({ accessibleCache: [1], hasPermCache: false });
    await expect(service.canManageRecord(user(5), TABLE, 1, VERB)).resolves.toBe(false);
  });

  it('verb but NOT edit-on-record → false', async () => {
    const { service } = createService({ accessibleCache: [99], hasPermCache: true });
    await expect(service.canManageRecord(user(5), TABLE, 1, VERB)).resolves.toBe(false);
  });

  it('userId undefined & not super_admin/SO → false, never queries with undefined', async () => {
    const { service, permissionCache, queryService, ownerScope } = createService();
    const caller = { isSuperAdmin: false, userId: undefined, client: 'admin' };
    await expect(service.canManageRecord(caller, TABLE, 1, VERB)).resolves.toBe(false);
    expect(ownerScope.isInOwnedScope).not.toHaveBeenCalled();
    expect(permissionCache.getAccessibleRecords).not.toHaveBeenCalled();
    expect(queryService.getAccessibleRecords).not.toHaveBeenCalled();
  });

  it('no edit permission resolvable for the module → false', async () => {
    const { service } = createService({ editCode: null, hasPermCache: true });
    await expect(service.canManageRecord(user(5), TABLE, 1, VERB)).resolves.toBe(false);
  });

  it('bypassCache reads DB path (uncached), not the cache path', async () => {
    const { service, permissionCache, queryService } = createService({
      accessibleDb: [1],
      hasPermDb: true,
      accessibleCache: [],
      hasPermCache: false,
    });
    await expect(service.canManageRecord(user(5), TABLE, 1, VERB, { bypassCache: true })).resolves.toBe(true);
    expect(queryService.getAccessibleRecords).toHaveBeenCalledWith(5, TABLE, EDIT_CODE);
    expect(permissionCache.getAccessibleRecords).not.toHaveBeenCalled();
  });
});

describe('ManageAuthorityService.filterManageableRecords', () => {
  it('super_admin sees all requested ids', async () => {
    const { service } = createService();
    await expect(
      service.filterManageableRecords({ isSuperAdmin: true, client: 'user' }, TABLE, [1, 2, 3], VERB),
    ).resolves.toEqual([1, 2, 3]);
  });

  it('returns only edit-on-record ids when caller holds verb', async () => {
    const { service } = createService({ accessibleCache: [2], hasPermCache: true });
    await expect(service.filterManageableRecords({ isSuperAdmin: false, userId: 5, client: 'user' }, TABLE, [1, 2, 3], VERB)).resolves.toEqual([2]);
  });

  it('returns [] when caller lacks verb (no edit set consulted)', async () => {
    const { service } = createService({ accessibleCache: [1, 2, 3], hasPermCache: false });
    await expect(service.filterManageableRecords({ isSuperAdmin: false, userId: 5, client: 'user' }, TABLE, [1, 2, 3], VERB)).resolves.toEqual([]);
  });

  it('includes SO-owned ids even without verb', async () => {
    const { service } = createService({ accessibleCache: [], hasPermCache: false, isInOwnedScope: true });
    await expect(service.filterManageableRecords({ isSuperAdmin: false, userId: 5, client: 'user' }, TABLE, [7], VERB)).resolves.toEqual([7]);
  });
});
