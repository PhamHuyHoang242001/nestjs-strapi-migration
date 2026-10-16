/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return */
import { MicroCacheService } from '@common/micro-cache';
import { SkillPackageQueryService } from '@modules/skill-package/skill-package-query.service';
import { PromptLibraryQueryService } from '@modules/prompt-library/prompt-library-query.service';
import { ApiCatalogQueryService } from '@modules/api-catalog/api-catalog-query.service';

// The active catalog list is identical for every caller, so it is served through the 10s
// micro-cache; the inactive list depends on who asks and always hits the DB.

function makeQueryBuilder() {
  const qb: any = {};
  for (const m of ['innerJoin', 'innerJoinAndMapOne', 'leftJoinAndSelect', 'leftJoin', 'where', 'andWhere', 'orderBy', 'addOrderBy', 'skip', 'take', 'select', 'setParameter', 'setParameters']) {
    qb[m] = jest.fn().mockReturnValue(qb);
  }
  qb.getMany = jest.fn().mockResolvedValue([]);
  qb.getRawOne = jest.fn().mockResolvedValue({ count: '0' });
  return qb;
}

function makeDeps() {
  const packageRepo: any = { createQueryBuilder: jest.fn(() => makeQueryBuilder()), findOne: jest.fn(), find: jest.fn() };
  const versionRepo: any = {
    createQueryBuilder: jest.fn(() => makeQueryBuilder()),
    findOne: jest.fn(),
    find: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    manager: { query: jest.fn().mockResolvedValue([]) },
  };
  const permissionQuery: any = { getUserPermissions: jest.fn().mockResolvedValue([]) };
  const metaRead: any = {
    getCoworkersByVersionIds: jest.fn().mockResolvedValue(new Map()),
    getResponsiblesByPackageIds: jest.fn().mockResolvedValue(new Map()),
    getPublishersByIds: jest.fn().mockResolvedValue(new Map()),
    getSupportersByPackageIds: jest.fn().mockResolvedValue(new Map()),
    getTagsByVersionIds: jest.fn().mockResolvedValue(new Map()),
    listSupportedPackageIds: jest.fn().mockResolvedValue([]),
  };
  return { packageRepo, versionRepo, permissionQuery, metaRead };
}

const WORKSPACES = [
  ['skill', SkillPackageQueryService],
  ['prompt', PromptLibraryQueryService],
  ['api-catalog', ApiCatalogQueryService],
] as const;

describe.each(WORKSPACES)('%s list micro-cache', (_ws, Service) => {
  let deps: ReturnType<typeof makeDeps>;
  let service: any;

  beforeEach(() => {
    deps = makeDeps();
    const S = Service as any;
    service = new S(deps.packageRepo, deps.versionRepo, deps.permissionQuery, deps.metaRead, undefined, undefined, new MicroCacheService());
  });

  it('serves a repeated active list from cache (one DB round for two callers)', async () => {
    const a = await service.list({ page: 1, limit: 20 }, 1);
    const b = await service.list({ limit: 20, page: 1 }, 2);

    expect(b).toBe(a);
    // One data query builder + one count query builder for the first call only.
    expect(deps.packageRepo.createQueryBuilder).toHaveBeenCalledTimes(2);
  });

  it('treats omitted page/limit and explicit defaults as the same key', async () => {
    await service.list({}, 1);
    await service.list({ page: 1, limit: 20 }, 1);

    expect(deps.packageRepo.createQueryBuilder).toHaveBeenCalledTimes(2);
  });

  it('uses separate entries for different pages / searches', async () => {
    await service.list({ page: 1 }, 1);
    await service.list({ page: 2 }, 1);
    await service.list({ page: 1, search: 'x' }, 1);

    expect(deps.packageRepo.createQueryBuilder).toHaveBeenCalledTimes(6);
  });

  it('treats omitted status / status=active and padded search as the same key', async () => {
    await service.list({ search: 'x' }, 1);
    await service.list({ status: 'active', search: '  x ' }, 1);

    expect(deps.packageRepo.createQueryBuilder).toHaveBeenCalledTimes(2);
  });

  it('gives a workspace SO and a regular user the same active result (no caller data in the shared entry)', async () => {
    const S = Service as any;
    const ownerScope = {
      getUserOwnerScope: jest.fn(async (uid: number) =>
        uid === 1 ? [{ rootTable: 'skill_packages', rootId: 0 }, { rootTable: 'prompt_packages', rootId: 0 }, { rootTable: 'api_catalog_packages', rootId: 0 }] : [],
      ),
    };
    service = new S(deps.packageRepo, deps.versionRepo, deps.permissionQuery, deps.metaRead, undefined, ownerScope, new MicroCacheService());

    const so = await service.list({ page: 1 }, 1);
    const regular = await service.list({ page: 1 }, 2);

    expect(regular).toBe(so);
    expect(deps.metaRead.listSupportedPackageIds).not.toHaveBeenCalled();
  });

  it('never caches the inactive list (caller-dependent)', async () => {
    await service.list({ status: 'inactive' }, 1);
    await service.list({ status: 'inactive' }, 1);

    expect(deps.packageRepo.createQueryBuilder).toHaveBeenCalledTimes(4);
  });

  it('without a cache provider every call hits the DB', async () => {
    const S = Service as any;
    service = new S(deps.packageRepo, deps.versionRepo, deps.permissionQuery, deps.metaRead);
    await service.list({ page: 1 }, 1);
    await service.list({ page: 1 }, 1);

    expect(deps.packageRepo.createQueryBuilder).toHaveBeenCalledTimes(4);
  });
});
