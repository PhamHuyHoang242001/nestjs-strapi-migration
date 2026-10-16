import 'reflect-metadata';
import { createInMemoryMicroCache, type MicroCacheService } from '@common/micro-cache';
import { LatestArtifactsService } from '../latest-artifacts.service';
import { LatestArtifactsController } from '../latest-artifacts.controller';
import { PERMISSION_META_KEY } from '@common/authorization/constants/authorization.constant';

// DB-mocked composition spec (module convention: no real DB). listStats issues one shared
// aggregate per workspace (cacheable, no caller binding) plus one per-caller my_versions query
// covering all four workspaces. The mock routes by SQL text, so call order does not matter.
const MY_VERSIONS_MARKER = 'AS my_api_catalog';

function makeService(cache?: MicroCacheService) {
  const query = jest.fn();
  const versionRepo = { manager: { query } } as never;
  return { service: new LatestArtifactsService(versionRepo, cache), query };
}

function routeQueries(
  query: jest.Mock,
  aggregates: Record<string, Record<string, string>[]>,
  mine: Record<string, string>[],
) {
  query.mockImplementation((sql: string) => {
    if (sql.includes(MY_VERSIONS_MARKER)) return Promise.resolve(mine);
    const table = Object.keys(aggregates).find((t) => sql.includes(`FROM ${t} v`));
    return Promise.resolve(table ? aggregates[table] : []);
  });
}

const USER_ID = 42;
const SKILL_AGGREGATE = { total: '7', pending: '2', approved: '4', rejected: '1', published: '5' };
const PROMPT_AGGREGATE = { total: '9', pending: '3', approved: '5', rejected: '1', published: '6' };
const API_AGGREGATE = { total: '4', pending: '1', approved: '2', rejected: '1', published: '3' };
const COWORKER_AGGREGATE = { total: '2', pending: '1', approved: '1', rejected: '0', published: '1' };
const AGGREGATES = {
  skill_versions: [SKILL_AGGREGATE],
  prompt_versions: [PROMPT_AGGREGATE],
  api_catalog_versions: [API_AGGREGATE],
  coworker_versions: [COWORKER_AGGREGATE],
};
const MINE = [{ my_skill: '3', my_prompt: '2', my_api_catalog: '1', my_coworker: '1' }];

const isAggregate = (sql: string) => !sql.includes(MY_VERSIONS_MARKER);

describe('LatestArtifactsService.listStats', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns one row per workspace, tagged with its type', async () => {
    const { service, query } = makeService();
    routeQueries(query, AGGREGATES, MINE);

    await expect(service.listStats(USER_ID)).resolves.toEqual({
      data: [
        { type: 'skill', total: 7, pending: 2, approved: 4, rejected: 1, published: 5, my_versions: 3 },
        { type: 'prompt', total: 9, pending: 3, approved: 5, rejected: 1, published: 6, my_versions: 2 },
        { type: 'api-catalog', total: 4, pending: 1, approved: 2, rejected: 1, published: 3, my_versions: 1 },
        { type: 'coworker', total: 2, pending: 1, approved: 1, rejected: 0, published: 1, my_versions: 1 },
      ],
    });
  });

  it('reports zeros for a workspace whose aggregate returns no row', async () => {
    const { service, query } = makeService();
    query.mockResolvedValue([]);

    const result = await service.listStats(USER_ID);

    expect(result.data).toEqual([
      { type: 'skill', total: 0, pending: 0, approved: 0, rejected: 0, published: 0, my_versions: 0 },
      { type: 'prompt', total: 0, pending: 0, approved: 0, rejected: 0, published: 0, my_versions: 0 },
      { type: 'api-catalog', total: 0, pending: 0, approved: 0, rejected: 0, published: 0, my_versions: 0 },
      { type: 'coworker', total: 0, pending: 0, approved: 0, rejected: 0, published: 0, my_versions: 0 },
    ]);
  });

  // The counting rules are unchanged from the per-workspace endpoints this replaced; only the
  // transport and the response shape differ.
  it.each([
    ['skill', 'skill_package_id', 'skill_versions', 'skill_packages'],
    ['prompt', 'prompt_package_id', 'prompt_versions', 'prompt_packages'],
    ['api-catalog', 'api_catalog_package_id', 'api_catalog_versions', 'api_catalog_packages'],
    ['coworker', 'coworker_package_id', 'coworker_versions', 'coworker_packages'],
  ])('classifies %s by latest live version per package', async (_type, fk, versionTable, packageTable) => {
    const { service, query } = makeService();
    routeQueries(query, AGGREGATES, MINE);

    await service.listStats(USER_ID);

    const sql = query.mock.calls
      .map((c) => c[0] as string)
      .find((q) => isAggregate(q) && q.includes(`FROM ${versionTable} v`)) as string;
    expect(sql).toContain(`DISTINCT ON (v.${fk})`);
    expect(sql).toContain(`ORDER BY v.${fk}, v.id DESC`);
    expect(sql).toContain(`INNER JOIN ${packageTable} p`);
    expect(sql).toContain("FILTER (WHERE state = 'pending')");
    expect(sql).toContain("FILTER (WHERE state = 'rejected')");
    // Published is counted independently: a package stays published while a newer version is pending.
    expect(sql).toContain('av.id = p.active_version_id');
    expect(sql).toContain("av.state = 'approved'");
    expect(sql).toContain("p.status = 'active'");
    // Soft-deleted rows never contribute on either side of the join.
    expect(sql).toContain('v.deleted_at IS NULL AND v.is_deleted = false');
    expect(sql).toContain('p.deleted_at IS NULL AND p.is_deleted = false');
  });

  it('keeps workspace aggregates unscoped and binds the caller only in my_versions', async () => {
    const { service, query } = makeService();
    routeQueries(query, AGGREGATES, MINE);

    await service.listStats(USER_ID);

    const aggregateCalls = query.mock.calls.filter((c) => isAggregate(c[0] as string));
    const mineCalls = query.mock.calls.filter((c) => !isAggregate(c[0] as string));
    expect(aggregateCalls).toHaveLength(4);
    aggregateCalls.forEach((c) => expect(c[1]).toBeUndefined());
    expect(mineCalls).toHaveLength(1);
    expect(mineCalls[0][1]).toEqual([USER_ID]);
    const mineSql = mineCalls[0][0] as string;
    for (const table of ['skill_versions', 'prompt_versions', 'api_catalog_versions', 'coworker_versions']) {
      expect(mineSql).toContain(`FROM ${table} v`);
    }
    expect(mineSql).toContain('v.submitted_by = $1 OR p.created_by = $1');
    expect(mineSql).toContain('v.deleted_at IS NULL AND v.is_deleted = false');
  });

  it('shares cached aggregates across callers; my_versions stays per caller', async () => {
    const { service, query } = makeService(createInMemoryMicroCache());
    routeQueries(query, AGGREGATES, MINE);

    const a = await service.listStats(USER_ID);
    const b = await service.listStats(USER_ID + 1);

    expect(query.mock.calls.filter((c) => isAggregate(c[0] as string))).toHaveLength(4);
    expect(query.mock.calls.filter((c) => !isAggregate(c[0] as string)).map((c) => c[1])).toEqual([
      [USER_ID],
      [USER_ID + 1],
    ]);
    // Rows are fresh objects per caller — the cached aggregates are never mutated.
    expect(b.data[0]).not.toBe(a.data[0]);
    const c = await service.listStats(USER_ID);
    expect(c.data.map((r) => r.my_versions)).toEqual([3, 2, 1, 1]);
    expect(a.data[0].total).toBe(7);
  });
});

describe('LatestArtifactsController', () => {
  it('exposes the stats route', () => {
    expect(typeof LatestArtifactsController.prototype.listStats).toBe('function');
  });

  it('leaves stats Bearer-only, like the rest of the hub', () => {
    expect(Reflect.getMetadata(PERMISSION_META_KEY, LatestArtifactsController.prototype.listStats)).toBeUndefined();
  });
});
