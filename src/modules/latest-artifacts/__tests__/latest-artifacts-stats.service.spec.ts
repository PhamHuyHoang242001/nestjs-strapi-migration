import 'reflect-metadata';
import { LatestArtifactsService } from '../latest-artifacts.service';
import { LatestArtifactsController } from '../latest-artifacts.controller';
import { PERMISSION_META_KEY } from '@common/authorization/constants/authorization.constant';

// DB-mocked composition spec (module convention: no real DB). listStats issues one aggregate per
// workspace; Promise.all invokes the two thunks in array order, so skill is call 0, prompt call 1.
function makeService() {
  const query = jest.fn();
  const versionRepo = { manager: { query } } as never;
  return { service: new LatestArtifactsService(versionRepo), query };
}

const USER_ID = 42;
const SKILL_AGGREGATE = { total: '7', pending: '2', approved: '4', rejected: '1', published: '5', my_versions: '3' };
const PROMPT_AGGREGATE = { total: '9', pending: '3', approved: '5', rejected: '1', published: '6', my_versions: '2' };
const API_AGGREGATE = { total: '4', pending: '1', approved: '2', rejected: '1', published: '3', my_versions: '1' };

describe('LatestArtifactsService.listStats', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns one row per workspace, tagged with its type', async () => {
    const { service, query } = makeService();
    query
      .mockResolvedValueOnce([SKILL_AGGREGATE])
      .mockResolvedValueOnce([PROMPT_AGGREGATE])
      .mockResolvedValueOnce([API_AGGREGATE]);

    await expect(service.listStats(USER_ID)).resolves.toEqual({
      data: [
        { type: 'skill', total: 7, pending: 2, approved: 4, rejected: 1, published: 5, my_versions: 3 },
        { type: 'prompt', total: 9, pending: 3, approved: 5, rejected: 1, published: 6, my_versions: 2 },
        { type: 'api-catalog', total: 4, pending: 1, approved: 2, rejected: 1, published: 3, my_versions: 1 },
      ],
    });
  });

  it('reports zeros for a workspace whose aggregate returns no row', async () => {
    const { service, query } = makeService();
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const result = await service.listStats(USER_ID);

    expect(result.data).toEqual([
      { type: 'skill', total: 0, pending: 0, approved: 0, rejected: 0, published: 0, my_versions: 0 },
      { type: 'prompt', total: 0, pending: 0, approved: 0, rejected: 0, published: 0, my_versions: 0 },
      { type: 'api-catalog', total: 0, pending: 0, approved: 0, rejected: 0, published: 0, my_versions: 0 },
    ]);
  });

  // The counting rules are unchanged from the per-workspace endpoints this replaced; only the
  // transport and the response shape differ.
  it.each([
    ['skill', 0, 'skill_package_id', 'skill_versions', 'skill_packages'],
    ['prompt', 1, 'prompt_package_id', 'prompt_versions', 'prompt_packages'],
    ['api-catalog', 2, 'api_catalog_package_id', 'api_catalog_versions', 'api_catalog_packages'],
  ])('classifies %s by latest live version per package', async (_type, callIndex, fk, versionTable, packageTable) => {
    const { service, query } = makeService();
    query.mockResolvedValue([SKILL_AGGREGATE]);

    await service.listStats(USER_ID);

    const sql = query.mock.calls[callIndex as number][0] as string;
    expect(sql).toContain(`DISTINCT ON (v.${fk as string})`);
    expect(sql).toContain(`ORDER BY v.${fk as string}, v.id DESC`);
    expect(sql).toContain(`FROM ${versionTable as string} v`);
    expect(sql).toContain(`INNER JOIN ${packageTable as string} p`);
    expect(sql).toContain("FILTER (WHERE state = 'pending')");
    expect(sql).toContain("FILTER (WHERE state = 'rejected')");
    // Published is counted independently: a package stays published while a newer version is pending.
    expect(sql).toContain('av.id = p.active_version_id');
    expect(sql).toContain("av.state = 'approved'");
    expect(sql).toContain("p.status = 'active'");
    // Soft-deleted rows never contribute on either side of the join.
    expect(sql).toContain('v.deleted_at IS NULL AND v.is_deleted = false');
    expect(sql).toContain('p.deleted_at IS NULL AND p.is_deleted = false');
    expect(sql).toContain('v.submitted_by = $1 OR p.created_by = $1');
  });

  it('binds the caller id for my_versions and keeps workspace aggregates unscoped', async () => {
    const { service, query } = makeService();
    query.mockResolvedValue([SKILL_AGGREGATE]);

    await service.listStats(USER_ID);

    expect(query.mock.calls[0][1]).toEqual([USER_ID]);
    expect(query.mock.calls[1][1]).toEqual([USER_ID]);
    expect(query.mock.calls[2][1]).toEqual([USER_ID]);
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
