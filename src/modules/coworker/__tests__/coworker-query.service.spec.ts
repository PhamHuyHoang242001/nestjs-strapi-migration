/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CoworkerQueryService } from '../coworker-query.service';
import { CoworkerPackageStatus } from '@modules/databases/coworker-package.entity';
import { CoworkerVersionState } from '@modules/databases/coworker-version.entity';

const USER_ID = 10;
const OTHER_USER_ID = 20;
const PACKAGE_ID = 1;
const VERSION_ID = 5;

function makeQueryBuilder(resultRows: unknown[] = [], countValue = '0') {
  const capturedWheres: string[] = [];
  const capturedParams: Record<string, unknown> = {};
  const qb: any = {
    innerJoin: jest.fn().mockReturnThis(),
    innerJoinAndMapOne: jest.fn().mockReturnThis(),
    where: jest.fn((sql: string, p?: Record<string, unknown>) => {
      capturedWheres.push(sql);
      if (p) Object.assign(capturedParams, p);
      return qb;
    }),
    andWhere: jest.fn((sql: string, p?: Record<string, unknown>) => {
      capturedWheres.push(sql);
      if (p) Object.assign(capturedParams, p);
      return qb;
    }),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(resultRows),
    getRawOne: jest.fn().mockResolvedValue({ count: countValue }),
    capturedWheres,
    capturedParams,
  };
  return qb;
}

function makeMetaRead() {
  return {
    getResponsiblesByPackageIds: jest.fn().mockResolvedValue(new Map()),
    getPublishersByIds: jest.fn().mockResolvedValue(new Map()),
    getSupportersByPackageIds: jest.fn().mockResolvedValue(new Map()),
    listSupportedPackageIds: jest.fn().mockResolvedValue([]),
  };
}

describe('CoworkerQueryService', () => {
  let service: CoworkerQueryService;
  let packageRepo: any;
  let versionRepo: any;
  let permissionQuery: any;
  let metaRead: any;

  beforeEach(() => {
    jest.clearAllMocks();
    permissionQuery = { getUserPermissions: jest.fn().mockResolvedValue([]) };
    packageRepo = { createQueryBuilder: jest.fn(), findOne: jest.fn() };
    versionRepo = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      manager: { query: jest.fn().mockResolvedValue([]) },
    };
    metaRead = makeMetaRead();
    service = new CoworkerQueryService(packageRepo, versionRepo, permissionQuery, metaRead);
  });

  it('list defaults to active packages for Bearer callers', async () => {
    const qb = makeQueryBuilder();
    packageRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);
    await service.list({ page: 1, limit: 10 }, USER_ID);
    expect(qb.capturedParams.status).toBe(CoworkerPackageStatus.ACTIVE);
  });

  it('approver requesting status=inactive is scoped to own/supporter packages', async () => {
    const qb = makeQueryBuilder();
    packageRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);
    permissionQuery.getUserPermissions.mockResolvedValue(['coworker_approve']);
    await service.list({ page: 1, limit: 10, status: CoworkerPackageStatus.INACTIVE }, USER_ID);
    expect(qb.capturedParams.status).toBe(CoworkerPackageStatus.INACTIVE);
    expect(qb.capturedParams.viewerId).toBe(USER_ID);
  });

  it('workspace SO may filter status=inactive (all inactive)', async () => {
    const qb = makeQueryBuilder();
    packageRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);
    const ownerScope = {
      getUserOwnerScope: jest.fn().mockResolvedValue([{ rootTable: 'coworker_packages', rootId: 0 }]),
    };
    service = new CoworkerQueryService(packageRepo, versionRepo, permissionQuery, metaRead, ownerScope as never);
    await service.list({ page: 1, limit: 10, status: CoworkerPackageStatus.INACTIVE }, USER_ID);
    expect(qb.capturedParams.status).toBe(CoworkerPackageStatus.INACTIVE);
    expect(qb.capturedParams.viewerId).toBeUndefined();
  });

  it('detail isUpdate is true only when canBump (upload + creator/supporter)', async () => {
    packageRepo.findOne.mockResolvedValue({
      id: PACKAGE_ID,
      created_by: USER_ID,
      status: CoworkerPackageStatus.ACTIVE,
      is_deleted: false,
      publisher_id: 1,
      active_version_id: VERSION_ID,
      active_version: { id: VERSION_ID, submitted_by: USER_ID, model_id: 1 },
    });
    permissionQuery.getUserPermissions.mockResolvedValue(['coworker_upload']);
    const result = await service.detail(PACKAGE_ID, USER_ID);
    expect(result.isUpdate).toBe(true);
  });

  it('detail isUpdate is false for approve-only stranger', async () => {
    packageRepo.findOne.mockResolvedValue({
      id: PACKAGE_ID,
      created_by: OTHER_USER_ID,
      status: CoworkerPackageStatus.ACTIVE,
      is_deleted: false,
      publisher_id: 1,
      active_version_id: VERSION_ID,
      active_version: { id: VERSION_ID, submitted_by: OTHER_USER_ID, model_id: 1 },
    });
    permissionQuery.getUserPermissions.mockResolvedValue(['coworker_approve']);
    const result = await service.detail(PACKAGE_ID, USER_ID);
    expect(result.isUpdate).toBe(false);
  });

  it('inactive detail 404s for a stranger without owner/support/SO', async () => {
    packageRepo.findOne.mockResolvedValue({
      id: PACKAGE_ID,
      created_by: OTHER_USER_ID,
      status: CoworkerPackageStatus.INACTIVE,
      is_deleted: false,
      publisher_id: 1,
    });
    await expect(service.detail(PACKAGE_ID, USER_ID)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('inactive detail 404s for approver who is not owner/supporter/SO', async () => {
    packageRepo.findOne.mockResolvedValue({
      id: PACKAGE_ID,
      created_by: OTHER_USER_ID,
      status: CoworkerPackageStatus.INACTIVE,
      is_deleted: false,
      publisher_id: 1,
    });
    permissionQuery.getUserPermissions.mockResolvedValue(['coworker_approve']);
    await expect(service.detail(PACKAGE_ID, USER_ID)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('versionDetail forbids a stranger without approve', async () => {
    versionRepo.findOne.mockResolvedValue({
      id: VERSION_ID,
      coworker_package_id: PACKAGE_ID,
      submitted_by: OTHER_USER_ID,
      is_deleted: false,
      state: CoworkerVersionState.APPROVED,
    });
    packageRepo.findOne.mockResolvedValue({ id: PACKAGE_ID, created_by: OTHER_USER_ID, is_deleted: false });
    await expect(service.versionDetail(VERSION_ID, USER_ID)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('versionDetail forbids a package supporter without submitter/creator/approve', async () => {
    versionRepo.findOne.mockResolvedValue({
      id: VERSION_ID,
      coworker_package_id: PACKAGE_ID,
      submitted_by: OTHER_USER_ID,
      is_deleted: false,
      state: CoworkerVersionState.APPROVED,
      model_id: 1,
    });
    packageRepo.findOne.mockResolvedValue({
      id: PACKAGE_ID,
      created_by: OTHER_USER_ID,
      is_deleted: false,
      publisher_id: 1,
    });
    metaRead.getSupportersByPackageIds.mockResolvedValue(new Map([[PACKAGE_ID, [{ id: USER_ID, email: 's@x.com' }]]]));
    await expect(service.versionDetail(VERSION_ID, USER_ID)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('listVersions own-scope is submitter or creator only — supporter does not widen', async () => {
    const query = jest.fn().mockImplementation(async (sql: string) => {
      if (/COUNT\(\*\)::int/.test(sql)) return [{ total: 0 }];
      return [];
    });
    versionRepo.manager = { query };
    await service.listVersions({ state: 'all' }, USER_ID);
    const sqls = query.mock.calls.map((c) => c[0] as string).join(' || ');
    expect(sqls).toContain('v.submitted_by = $1 OR p.created_by = $1');
    expect(sqls).not.toContain('ai_hub_supporters');
  });

  it('getDiff forbids a package supporter without submitter/creator/approve', async () => {
    versionRepo.findOne.mockResolvedValue({
      id: VERSION_ID,
      coworker_package_id: PACKAGE_ID,
      submitted_by: OTHER_USER_ID,
      is_deleted: false,
      state: CoworkerVersionState.APPROVED,
      model_id: 1,
    });
    packageRepo.findOne.mockResolvedValue({
      id: PACKAGE_ID,
      created_by: OTHER_USER_ID,
      active_version_id: null,
    });
    metaRead.getSupportersByPackageIds.mockResolvedValue(new Map([[PACKAGE_ID, [{ id: USER_ID, email: 's@x.com' }]]]));
    await expect(service.getDiff(VERSION_ID, USER_ID)).rejects.toBeInstanceOf(ForbiddenException);
  });

  describe('per-channel links', () => {
    const ACTIVE_ID = 4;
    // Join rows as the channel loader's SQL returns them (one link per channel per version).
    const channelRows = [
      { version_id: ACTIVE_ID, id: 1, name: 'Teams', link: 'https://teams.microsoft.com/l/old' },
      { version_id: VERSION_ID, id: 1, name: 'Teams', link: 'https://teams.microsoft.com/l/new' },
      { version_id: VERSION_ID, id: 2, name: 'Zalo', link: 'https://zalo.me/g/z' },
    ];

    function stubManager() {
      const query = jest.fn().mockImplementation(async (sql: string, params?: any[]) => {
        if (sql.includes('coworker_version_channels')) {
          const ids: number[] = params?.[0] ?? [];
          return channelRows.filter((r) => ids.includes(r.version_id));
        }
        return [];
      });
      versionRepo.manager = { query };
      return query;
    }

    it('channel loader selects the per-channel link', async () => {
      const query = stubManager();
      versionRepo.findOne.mockResolvedValue({
        id: VERSION_ID,
        coworker_package_id: PACKAGE_ID,
        submitted_by: USER_ID,
        state: CoworkerVersionState.APPROVED,
        model_id: 1,
      });
      packageRepo.findOne.mockResolvedValue({ id: PACKAGE_ID, created_by: OTHER_USER_ID, active_version_id: null });
      await service.getDiff(VERSION_ID, USER_ID);
      const sql = query.mock.calls.map((c) => c[0] as string).find((q) => q.includes('coworker_version_channels'));
      expect(sql).toContain('vc.link');
    });

    it('getDiff returns channel/link lists for the active (base) and target (incoming) versions', async () => {
      stubManager();
      versionRepo.findOne.mockResolvedValue({
        id: VERSION_ID,
        coworker_package_id: PACKAGE_ID,
        submitted_by: USER_ID,
        state: CoworkerVersionState.PENDING,
        model_id: 1,
      });
      packageRepo.findOne.mockResolvedValue({ id: PACKAGE_ID, created_by: OTHER_USER_ID, active_version_id: ACTIVE_ID });

      const res: any = await service.getDiff(VERSION_ID, USER_ID);

      expect(res.base).toEqual([{ channel_id: 1, name: 'Teams', link: 'https://teams.microsoft.com/l/old' }]);
      expect(res.incoming).toEqual([
        { channel_id: 1, name: 'Teams', link: 'https://teams.microsoft.com/l/new' },
        { channel_id: 2, name: 'Zalo', link: 'https://zalo.me/g/z' },
      ]);
      expect(res.metadata.channels).toEqual([
        { id: 1, name: 'Teams', link: 'https://teams.microsoft.com/l/new' },
        { id: 2, name: 'Zalo', link: 'https://zalo.me/g/z' },
      ]);
    });

    it('getDiff base is null when there is no other active version', async () => {
      stubManager();
      versionRepo.findOne.mockResolvedValue({
        id: VERSION_ID,
        coworker_package_id: PACKAGE_ID,
        submitted_by: USER_ID,
        state: CoworkerVersionState.PENDING,
        model_id: 1,
      });
      packageRepo.findOne.mockResolvedValue({ id: PACKAGE_ID, created_by: OTHER_USER_ID, active_version_id: VERSION_ID });

      const res: any = await service.getDiff(VERSION_ID, USER_ID);

      expect(res.base).toBeNull();
      expect(res.incoming).toHaveLength(2);
    });

    it('versionDetail comparison compares predecessor vs pending channel/link lists', async () => {
      stubManager();
      versionRepo.findOne.mockImplementation(async ({ where }: any) => {
        if (where.id === VERSION_ID) {
          return {
            id: VERSION_ID,
            coworker_package_id: PACKAGE_ID,
            submitted_by: USER_ID,
            state: CoworkerVersionState.PENDING,
            old_version: 1,
            model_id: 1,
          };
        }
        if (where.version_no === 1) return { id: ACTIVE_ID, version_no: 1 };
        return null;
      });
      packageRepo.findOne.mockResolvedValue({ id: PACKAGE_ID, created_by: OTHER_USER_ID, publisher_id: 1 });

      const res: any = await service.versionDetail(VERSION_ID, USER_ID);

      expect(res.comparison).toEqual({
        base_version_id: ACTIVE_ID,
        base_version_no: 1,
        base: [{ channel_id: 1, name: 'Teams', link: 'https://teams.microsoft.com/l/old' }],
        incoming: [
          { channel_id: 1, name: 'Teams', link: 'https://teams.microsoft.com/l/new' },
          { channel_id: 2, name: 'Zalo', link: 'https://zalo.me/g/z' },
        ],
      });
      expect(res.version.channels[1]).toEqual({ id: 2, name: 'Zalo', link: 'https://zalo.me/g/z' });
      expect(res.version).not.toHaveProperty('link');
    });
  });
});
