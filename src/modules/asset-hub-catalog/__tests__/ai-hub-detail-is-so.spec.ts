/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return */
import { SkillPackageQueryService } from '@modules/skill-package/skill-package-query.service';
import { PromptLibraryQueryService } from '@modules/prompt-library/prompt-library-query.service';
import { ApiCatalogQueryService } from '@modules/api-catalog/api-catalog-query.service';
import { CoworkerQueryService } from '@modules/coworker/coworker-query.service';

// Package detail and version detail expose `isSo`: whether the caller is the workspace SO
// (resource_owners rootId 0 on that workspace's package table).

const USER_ID = 10;
const PACKAGE_ID = 1;
const VERSION_ID = 5;

const WORKSPACES = [
  ['skill', 'skill_packages', SkillPackageQueryService, 'skill_package_id', true],
  ['prompt', 'prompt_packages', PromptLibraryQueryService, 'prompt_package_id', true],
  ['api-catalog', 'api_catalog_packages', ApiCatalogQueryService, 'api_catalog_package_id', true],
  ['coworker', 'coworker_packages', CoworkerQueryService, 'coworker_package_id', false],
] as const;

function makeDeps(fk: string) {
  // Package with an approved active version (the common detail case).
  const pkg = {
    id: PACKAGE_ID,
    created_by: USER_ID,
    status: 'active',
    is_deleted: false,
    publisher_id: 1,
    active_version_id: VERSION_ID,
  };
  const version = {
    id: VERSION_ID,
    [fk]: PACKAGE_ID,
    submitted_by: USER_ID,
    state: 'approved',
    is_deleted: false,
    model_id: 1,
    category_id: null,
    files: [],
  };
  return {
    packageRepo: { findOne: jest.fn().mockResolvedValue(pkg) },
    versionRepo: {
      findOne: jest.fn().mockResolvedValue(version),
      find: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      manager: { query: jest.fn().mockResolvedValue([]) },
    },
    permissionQuery: { getUserPermissions: jest.fn().mockResolvedValue([]) },
    metaRead: {
      getCoworkersByVersionIds: jest.fn().mockResolvedValue(new Map()),
      getTagsByVersionIds: jest.fn().mockResolvedValue(new Map()),
      getResponsiblesByPackageIds: jest.fn().mockResolvedValue(new Map()),
      getPublishersByIds: jest.fn().mockResolvedValue(new Map()),
      getSupportersByPackageIds: jest.fn().mockResolvedValue(new Map()),
      listSupportedPackageIds: jest.fn().mockResolvedValue([]),
    },
  };
}

function build(Service: any, deps: ReturnType<typeof makeDeps>, hasCategoryArg: boolean, ownerScope: unknown) {
  const base = [deps.packageRepo, deps.versionRepo, deps.permissionQuery, deps.metaRead];
  return hasCategoryArg ? new Service(...base, undefined, ownerScope) : new Service(...base, ownerScope);
}

describe.each(WORKSPACES)('%s detail / version detail isSo', (_ws, table, Service, fk, hasCategoryArg) => {
  const soScope = { getUserOwnerScope: jest.fn().mockResolvedValue([{ rootTable: table, rootId: 0 }]) };
  const otherScope = { getUserOwnerScope: jest.fn().mockResolvedValue([{ rootTable: 'other_packages', rootId: 0 }]) };

  it.each([
    ['workspace SO', soScope, true],
    ['SO of another workspace', otherScope, false],
    ['no owner scope', undefined, false],
  ])('package detail: %s → isSo=%p', async (_label, scope, expected) => {
    const service = build(Service, makeDeps(fk), hasCategoryArg, scope);
    const res: any = await service.detail(PACKAGE_ID, USER_ID);
    expect(res.isSo).toBe(expected);
  });

  it.each([
    ['workspace SO', soScope, true],
    ['SO of another workspace', otherScope, false],
    ['no owner scope', undefined, false],
  ])('version detail: %s → isSo=%p', async (_label, scope, expected) => {
    const service = build(Service, makeDeps(fk), hasCategoryArg, scope);
    const res: any = await service.versionDetail(VERSION_ID, USER_ID);
    expect(res.isSo).toBe(expected);
  });
});

describe.each(WORKSPACES)('%s package detail created_by_user', (_ws, _table, Service, fk, hasCategoryArg) => {
  it('returns the creator as { id, email } resolved with the submitter lookup', async () => {
    const deps = makeDeps(fk);
    deps.versionRepo.manager.query.mockImplementation(async (sql: string, params?: any[]) =>
      sql.includes('FROM users') ? (params?.[0] ?? []).map((id: number) => ({ id, email: `u${id}@x.vn` })) : [],
    );
    const service = build(Service, deps, hasCategoryArg, undefined);

    const res: any = await service.detail(PACKAGE_ID, USER_ID);

    expect(res.created_by).toBe(USER_ID);
    expect(res.created_by_user).toEqual({ id: USER_ID, email: `u${USER_ID}@x.vn` });
    const userLookups = deps.versionRepo.manager.query.mock.calls.filter((c: any[]) =>
      (c[0] as string).includes('FROM users'),
    );
    expect(userLookups).toHaveLength(1);
  });

  it('returns null when the creator user no longer exists', async () => {
    const service = build(Service, makeDeps(fk), hasCategoryArg, undefined);
    const res: any = await service.detail(PACKAGE_ID, USER_ID);
    expect(res.created_by_user).toBeNull();
  });
});

