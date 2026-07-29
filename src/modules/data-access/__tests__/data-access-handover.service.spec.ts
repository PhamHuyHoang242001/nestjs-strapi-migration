import { PermissionCacheService } from '@common/authorization';
import { SCOPE_TYPE } from '@common/enums';
import { ChangeHistoryLogger } from '@modules/change-history/change-history-logger.service';
import { DataAccess, UserDataAccess } from '@modules/databases/data-access.entity';
import { Permission } from '@modules/databases/permission.entity';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DataSource, In, Repository } from 'typeorm';
import { DataAccessService } from '../data-access.service';
import { HierarchyValidationService } from '../hierarchy-validation.service';
import { CallerContext } from '../helpers/manage-authority.helper';
import { UserType } from '@modules/databases/user.entity';
import { DataAccessRepository } from '../repository/data-access.repository';
import { RecordPathService } from '../services/record-path.service';
import { HandoverDataAccessDto } from '../dto/handover-data-access.dto';

const DIAG = 'bi_hub_diagnostic_reports';
const OTHER = 'bi_payment_programs';

const RUD_PERMS = [
  { id: 1, action: 'read' },
  { id: 2, action: 'update' },
  { id: 3, action: 'delete' },
];

function makeService(opts: {
  tableName?: string;
  manageable?: (recordId: number) => boolean;
  targetActive?: boolean;
  rulesForStrip?: any[];
}) {
  const canManageRecord = jest.fn(async (_c: CallerContext, _t: string, recordId: number) =>
    opts.manageable ? opts.manageable(recordId) : true,
  );
  const manageAuthority = {
    canManageRecord,
    filterManageableRecords: jest.fn(),
    getEditAccessibleRecordIds: jest.fn().mockResolvedValue([]),
  } as any;

  const managerMock = {
    find: jest.fn(async (entity: any) => {
      if (entity === Permission) return RUD_PERMS;
      if (entity === DataAccess) return opts.rulesForStrip ?? [];
      return [];
    }),
    create: jest.fn((_: any, data: any) => ({ id: 999, ...data })),
    save: jest.fn(async (e: any) => ({ ...e, id: e.id ?? 999 })),
    insert: jest.fn(),
    softDelete: jest.fn(),
  };
  const transaction = jest.fn(async (cb: any) => cb(managerMock));

  const query = jest.fn().mockResolvedValue(opts.targetActive === false ? [] : [{ id: 9 }]);
  const dataSource = { query, transaction } as unknown as DataSource;

  const cache = {
    invalidateByTable: jest.fn().mockResolvedValue(undefined),
    invalidateUser: jest.fn().mockResolvedValue(undefined),
  } as unknown as PermissionCacheService;
  const history = { log: jest.fn().mockResolvedValue(undefined) } as unknown as ChangeHistoryLogger;
  const moduleRepo = {
    findOne: jest.fn().mockResolvedValue({ id: 8, table_name: opts.tableName ?? DIAG }),
  } as unknown as Repository<any>;
  // Inline caller block resolves isSuperAdmin from the users row: id 1 = super_admin,
  // everyone else non-super. Keeps the super_admin test's semantics honest.
  const usersRepo = {
    findOne: jest.fn(({ where }: { where: { id: number } }) =>
      Promise.resolve({ id: where.id, type: where.id === 1 ? UserType.SUPER_ADMIN : 'staff' }),
    ),
  } as unknown as Repository<any>;

  const service = new DataAccessService(
    { findOne: jest.fn() } as unknown as DataAccessRepository,
    dataSource,
    { enforce: jest.fn() } as unknown as HierarchyValidationService,
    history,
    cache,
    { buildPath: jest.fn() } as unknown as RecordPathService,
    moduleRepo,
    { softDelete: jest.fn() } as unknown as Repository<any>,
    { softDelete: jest.fn() } as unknown as Repository<any>,
    manageAuthority,
    usersRepo,
  );
  return { service, transaction, managerMock, cache, canManageRecord };
}

const dto = (over: Partial<HandoverDataAccessDto> = {}): HandoverDataAccessDto => ({
  module_id: 8,
  data_ids: [12],
  from_user_id: 5,
  to_user_id: 9,
  ...over,
});

describe('DataAccessService.handover()', () => {
  it('rejects handover to the same user', async () => {
    const { service } = makeService({});
    await expect(service.handover(dto({ from_user_id: 7, to_user_id: 7 }), 'u', { id: 5 }, 'user')).rejects.toThrow(
      'cannot_handover_to_self',
    );
  });

  it('rejects a table outside MANAGE_ENABLED_MODULES', async () => {
    const { service } = makeService({ tableName: OTHER });
    await expect(service.handover(dto(), 'u', { id: 5 }, 'user')).rejects.toThrow('handover_not_enabled_for_table');
  });

  it('rejects an inactive/nonexistent recipient', async () => {
    const { service } = makeService({ targetActive: false });
    await expect(service.handover(dto(), 'u', { id: 5 }, 'user')).rejects.toThrow('target_user_invalid');
  });

  it('403 + no transaction when caller cannot manage a record (all-or-nothing)', async () => {
    const { service, transaction } = makeService({ manageable: (id) => id === 12 });
    await expect(service.handover(dto({ data_ids: [12, 13] }), 'u', { id: 5 }, 'user')).rejects.toThrow(ForbiddenException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('grants B RUD and strips A, atomically; invalidates A, B, and table', async () => {
    const rule = {
      id: 100,
      user_data_access: [
        { id: 201, user_id: 5, deleted_at: null, permission: { action: 'read' } },
        { id: 202, user_id: 5, deleted_at: null, permission: { action: 'update' } },
        { id: 203, user_id: 5, deleted_at: null, permission: { action: 'delete' } },
      ],
      role_data_access: [],
    };
    const { service, transaction, managerMock, cache } = makeService({ rulesForStrip: [rule] });

    await service.handover(dto(), 'u', { id: 5 }, 'user');

    expect(transaction).toHaveBeenCalledTimes(1);
    // B granted: UserDataAccess rows for user 9 inserted
    const insertedRows = managerMock.insert.mock.calls.find((c: any[]) => c[0] === UserDataAccess)?.[1];
    expect(insertedRows).toEqual(
      expect.arrayContaining([expect.objectContaining({ user_id: 9, data_access_id: 999 })]),
    );
    // A stripped: A's three RUD junctions soft-deleted, then the now-empty rule
    expect(managerMock.softDelete).toHaveBeenCalledWith(UserDataAccess, { id: In([201, 202, 203]) });
    expect(managerMock.softDelete).toHaveBeenCalledWith(DataAccess, { id: 100 });
    // Cache invalidation for both users + table
    expect(cache.invalidateUser).toHaveBeenCalledWith(5);
    expect(cache.invalidateUser).toHaveBeenCalledWith(9);
    expect(cache.invalidateByTable).toHaveBeenCalledWith(DIAG);
  });

  it('preserves third-party rules: a rule with another subject is not deleted', async () => {
    // Rule shared by A (RUD) and user C (view) — stripping A must NOT delete the rule.
    const rule = {
      id: 100,
      user_data_access: [
        { id: 201, user_id: 5, deleted_at: null, permission: { action: 'read' } },
        { id: 202, user_id: 5, deleted_at: null, permission: { action: 'update' } },
        { id: 210, user_id: 42, deleted_at: null, permission: { action: 'read' } }, // user C
      ],
      role_data_access: [],
    };
    const { service, managerMock } = makeService({ rulesForStrip: [rule] });

    await service.handover(dto(), 'u', { id: 5 }, 'user');

    expect(managerMock.softDelete).toHaveBeenCalledWith(UserDataAccess, { id: In([201, 202]) });
    // Rule still has user 42 → must not be soft-deleted.
    expect(managerMock.softDelete).not.toHaveBeenCalledWith(DataAccess, { id: 100 });
  });

  it('super_admin/SO caller: canManageRecord true → proceeds', async () => {
    const { service, transaction } = makeService({ manageable: () => true });
    await expect(
      service.handover(dto(), 'admin', { id: 1 }, 'user'),
    ).resolves.toMatchObject({ to_user_id: 9 });
    expect(transaction).toHaveBeenCalled();
  });
});
