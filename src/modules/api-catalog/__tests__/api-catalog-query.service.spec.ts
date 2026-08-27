import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ApiCatalogQueryService } from '../api-catalog-query.service';
import { ApiPackageStatus } from '@modules/databases/api-catalog-package.entity';
import { ApiVersionState } from '@modules/databases/api-catalog-version.entity';

const USER_ID = 10;
const OTHER_USER_ID = 20;
const VERSION_ID = 5;
const PACKAGE_ID = 1;

// Minimal QueryBuilder mock capturing WHERE fragments and params for SQL-shape assertions.
// Both the page query and the count query go through createQueryBuilder so mock returns
// the same chained object for both calls, accumulating all WHERE clauses together.
function makeQueryBuilder(resultRows: unknown[] = [], countValue = '0') {
  const capturedWheres: string[] = [];
  const capturedParams: Record<string, unknown> = {};
  const capturedOrders: Array<{ col: string; dir?: string }> = [];
  let currentCountValue = countValue;
  let currentResultRows = resultRows;
  const qb: any = {
    innerJoin: jest.fn().mockReturnThis(),
    innerJoinAndSelect: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
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
    orderBy: jest.fn((col: string, dir?: string) => {
      capturedOrders.push({ col, dir });
      return qb;
    }),
    addOrderBy: jest.fn((col: string, dir?: string) => {
      capturedOrders.push({ col, dir });
      return qb;
    }),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockImplementation(() => Promise.resolve(currentResultRows)),
    getCount: jest.fn().mockResolvedValue(0),
    getRawOne: jest.fn().mockImplementation(() => Promise.resolve({ count: currentCountValue })),
    capturedWheres,
    capturedParams,
    capturedOrders,
    _setResults: (rows: unknown[], count: string) => {
      currentResultRows = rows;
      currentCountValue = count;
    },
  };
  return qb;
}

// Stand-in for AssetHubItemMetaReadService. Returns empty maps by default so the existing shape
// assertions stay focused; the tag/publisher/PIC decoration has its own specs.
function makeMetaRead(overrides: Record<string, unknown> = {}) {
  return {
    getTagsByVersionIds: jest.fn().mockResolvedValue(new Map()),
    getResponsiblesByPackageIds: jest.fn().mockResolvedValue(new Map()),
    getPublishersByIds: jest.fn().mockResolvedValue(new Map()),
    ...overrides,
  };
}

describe('ApiCatalogQueryService', () => {
  let service: ApiCatalogQueryService;
  let packageRepo: any;
  let versionRepo: any;
  let permissionQuery: any;
  let metaRead: any;

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: caller has no permissions (non-approver) — list() resolves this for its status gate.
    permissionQuery = { getUserPermissions: jest.fn().mockResolvedValue([]) };
    packageRepo = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
    };
    versionRepo = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      // hasPendingVersion is now sourced from a separate COUNT (history is approved-only). Default 0
      // → no pending; tests needing a pending override this.
      count: jest.fn().mockResolvedValue(0),
      // Default manager for the submitter-email resolver (SELECT id,email FROM users). Empty →
      // submitted_by_email resolves to null. Tests needing real emails override manager.query.
      manager: { query: jest.fn().mockResolvedValue([]) },
    };
    metaRead = makeMetaRead();
    service = new ApiCatalogQueryService(packageRepo, versionRepo, permissionQuery, metaRead);
  });

  // Workspace counters moved to LatestArtifactsService.listStats — see its spec.
  it('no longer exposes a per-workspace stats method', () => {
    expect((service as unknown as Record<string, unknown>).stats).toBeUndefined();
  });

  // ---- list ----
  describe('list — active-only filter + sort + limit cap', () => {
    it('emits active-only WHERE and id DESC sort; limit capped at 100', async () => {
      const qb = makeQueryBuilder();
      packageRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

      await service.list({ page: 1, limit: 200, search: undefined }, USER_ID);

      const joined = qb.capturedWheres.join(' | ');
      expect(joined).toContain('pkg.status = :status');
      expect(qb.capturedParams.status).toBe(ApiPackageStatus.ACTIVE);
      expect(joined).toContain('pkg.active_version_id IS NOT NULL');
      expect(joined).toContain('COALESCE(pkg.is_deleted, false) = false');
      expect(qb.orderBy).toHaveBeenCalledWith('pkg.id', 'DESC');
      expect(qb.take).toHaveBeenCalledWith(100);
    });

    it('status defaults to active when omitted', async () => {
      const qb = makeQueryBuilder();
      packageRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);
      permissionQuery.getUserPermissions.mockResolvedValue(['api_approve']);

      await service.list({ page: 1, limit: 10 }, USER_ID);

      expect(qb.capturedParams.status).toBe(ApiPackageStatus.ACTIVE);
    });

    it('approver may filter status=inactive', async () => {
      const qb = makeQueryBuilder();
      packageRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);
      permissionQuery.getUserPermissions.mockResolvedValue(['api_approve']);

      await service.list({ page: 1, limit: 10, status: ApiPackageStatus.INACTIVE }, USER_ID);

      expect(qb.capturedParams.status).toBe(ApiPackageStatus.INACTIVE);
    });

    it('non-approver requesting status=inactive is forced back to active (no leak)', async () => {
      const qb = makeQueryBuilder();
      packageRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);
      permissionQuery.getUserPermissions.mockResolvedValue(['api_upload']); // not an approver

      await service.list({ page: 1, limit: 10, status: ApiPackageStatus.INACTIVE }, USER_ID);

      expect(qb.capturedParams.status).toBe(ApiPackageStatus.ACTIVE);
    });

    it('search filter is parameter-bound (not string-concatenated)', async () => {
      const qb = makeQueryBuilder();
      packageRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

      await service.list({ page: 1, limit: 10, search: 'hello world' }, USER_ID);

      const joined = qb.capturedWheres.join(' | ');
      expect(joined).toContain('ILIKE :search');
      expect(qb.capturedParams.search).toContain('hello world');
    });

    it('search also matches a catalog tag NAME, via a non-correlated subquery', async () => {
      const qb = makeQueryBuilder();
      packageRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

      await service.list({ page: 1, limit: 10, search: 'happ' }, USER_ID);

      const joined = qb.capturedWheres.join(' | ');
      // Tag matching now goes through the join table, so a keyword hits the catalog name.
      expect(joined).toContain('t.name ILIKE :search');
      expect(joined).toContain('SELECT vt.api_catalog_version_id FROM api_catalog_version_tags vt');
      // The jsonb column is gone from the read path entirely.
      expect(joined).not.toContain('av.tags');
      // The subquery must not reference an outer alias — that breaks TypeORM's skip/take rewrite.
      expect(joined).not.toContain('EXISTS');
      expect(joined).toContain('av.name ILIKE :search');
      expect(qb.capturedParams.search).toContain('happ');
    });

    it('tag-in-search clause is applied to BOTH page and count queries (no total drift)', async () => {
      const qb = makeQueryBuilder();
      packageRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

      await service.list({ page: 1, limit: 10, search: 'happ' }, USER_ID);

      const occurrences = qb.capturedWheres.filter((w: string) => w.includes('t.name ILIKE :search')).length;
      expect(occurrences).toBe(2);
    });

    it('list ignores leftover tag_ids / kind — tag matching is search-only', async () => {
      const qb = makeQueryBuilder();
      packageRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

      await service.list({ page: 1, limit: 10, tag_ids: [3, 4], kind: 'personal' } as never, USER_ID);

      const joined = qb.capturedWheres.join(' | ');
      expect(joined).not.toContain('HAVING COUNT(DISTINCT vt.tag_id)');
      expect(joined).not.toContain('t.kind = :kind');
      expect(qb.capturedParams.tag_ids).toBeUndefined();
      expect(qb.capturedParams.kind).toBeUndefined();
    });

    it('publisher_id filter binds against the package column', async () => {
      const qb = makeQueryBuilder();
      packageRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

      await service.list({ page: 1, limit: 10, publisher_id: 4 }, USER_ID);

      expect(qb.capturedWheres.join(' | ')).toContain('pkg.publisher_id = :publisher_id');
      expect(qb.capturedParams.publisher_id).toBe(4);
    });

    it('decorates rows with publisher, people in charge and tags — one batched query each', async () => {
      const qb = makeQueryBuilder(
        [{ id: PACKAGE_ID, publisher_id: 9, active_version_id: 7, active_version: { id: 7 } }],
        '1',
      );
      packageRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);
      metaRead.getPublishersByIds.mockResolvedValue(new Map([[9, { id: 9, name: 'Khối CNTT' }]]));
      metaRead.getResponsiblesByPackageIds.mockResolvedValue(new Map([[PACKAGE_ID, [{ id: 2, email: 'a@x.vn' }]]]));
      metaRead.getTagsByVersionIds.mockResolvedValue(new Map([[7, [{ id: 3, name: 'Báo cáo', kind: 'personal' }]]]));

      const result = await service.list({ page: 1, limit: 10 }, USER_ID);

      const row = result.data[0] as Record<string, any>;
      expect(row.publisher).toEqual({ id: 9, name: 'Khối CNTT' });
      expect(row.responsible_users).toEqual([{ id: 2, email: 'a@x.vn' }]);
      expect(row.active_version.tags).toEqual([{ id: 3, name: 'Báo cáo', kind: 'personal' }]);
      expect(metaRead.getPublishersByIds).toHaveBeenCalledTimes(1);
      expect(metaRead.getResponsiblesByPackageIds).toHaveBeenCalledTimes(1);
      expect(metaRead.getTagsByVersionIds).toHaveBeenCalledTimes(1);
    });

    it('never puts the usage guide on a list row', async () => {
      const qb = makeQueryBuilder(
        [
          {
            id: PACKAGE_ID,
            publisher_id: 9,
            active_version_id: 7,
            active_version: { id: 7, usage_guide_html: '<p>x</p>' },
          },
        ],
        '1',
      );
      packageRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

      const result = await service.list({ page: 1, limit: 10 }, USER_ID);

      expect((result.data[0] as Record<string, any>).active_version).not.toHaveProperty('usage_guide_html');
      expect((result.data[0] as Record<string, any>).active_version).not.toHaveProperty('mock_req');
      expect((result.data[0] as Record<string, any>).active_version).not.toHaveProperty('mock_res');
    });

    it('returns {data, meta:{total, page, limit}} shape', async () => {
      const qb = makeQueryBuilder([{ id: 1 }], '5');
      packageRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

      const result = await service.list({ page: 2, limit: 5 }, USER_ID);

      expect(result).toMatchObject({ data: [{ id: 1 }], meta: { total: 5, page: 2, limit: 5 } });
    });

    it('returns the active_version verbatim (no file fold)', async () => {
      const activeVersion = {
        id: 7,
        name: 'My Prompt',
        avatar_url: '/uploads/avatar.png',
      };
      const pkg = { id: 1, active_version: activeVersion };
      const qb = makeQueryBuilder([pkg], '1');
      packageRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

      const result = await service.list({ page: 1, limit: 10 }, USER_ID);

      const av = result.data[0].active_version as any;
      expect(av.avatar_url).toBe('/uploads/avatar.png');
      // No file-fold: there is no `file` property and no raw `files[]`.
      expect(av.file).toBeUndefined();
      expect(av.files).toBeUndefined();
      // No files relation is ever joined.
      expect(qb.leftJoinAndSelect).not.toHaveBeenCalled();
    });
  });

  // ---- detail — permission gating + no file fold ----
  describe('detail — returns versions verbatim (no file fold), loads active_version relation only', () => {
    it('returns active_version + history versions without any file/files property', async () => {
      const activeVersion = {
        id: 10,
        name: 'AvatarPrompt',
        avatar_url: '/uploads/a.png',
      };
      packageRepo.findOne = jest.fn().mockResolvedValue({
        id: 1,
        status: 'active',
        is_deleted: false,
        created_by: USER_ID,
        active_version: activeVersion,
      });
      const reviewedAt = new Date('2026-01-15T00:00:00.000Z');
      versionRepo.find = jest
        .fn()
        .mockResolvedValue([{ id: 11, version_no: 1, reviewed_at: reviewedAt, usage_guide_html: '# v1' }]);
      permissionQuery.getUserPermissions.mockResolvedValue([]);

      const result = await service.detail(1, USER_ID);

      expect((result.active_version as any).avatar_url).toBe('/uploads/a.png');
      expect((result.active_version as any).file).toBeUndefined();
      expect(result.versions[0]).toEqual({ version_no: 1, reviewed_at: reviewedAt });
      expect((result.versions[0] as any).usage_guide_html).toBeUndefined();
      expect(packageRepo.findOne).toHaveBeenCalledWith(expect.objectContaining({ relations: ['active_version'] }));
      expect(versionRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ select: ['id', 'version_no', 'reviewed_at'] }),
      );
    });

    it('throws NotFound when the package is missing', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue(null);
      await expect(service.detail(999, USER_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFound when the package is inactive and caller is not owner or approver', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue({
        id: 1,
        status: ApiPackageStatus.INACTIVE,
        is_deleted: false,
        created_by: OTHER_USER_ID,
        active_version: null,
      });
      permissionQuery.getUserPermissions.mockResolvedValue([]);

      await expect(service.detail(1, USER_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('allows owner to view inactive package', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue({
        id: 1,
        status: ApiPackageStatus.INACTIVE,
        is_deleted: false,
        created_by: USER_ID,
        active_version: { id: 10 },
      });
      versionRepo.find = jest.fn().mockResolvedValue([]);
      permissionQuery.getUserPermissions.mockResolvedValue([]);

      const result = await service.detail(1, USER_ID);
      expect(result.id).toBe(1);
    });

    it('allows approver to view inactive package', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue({
        id: 1,
        status: ApiPackageStatus.INACTIVE,
        is_deleted: false,
        created_by: OTHER_USER_ID,
        active_version: { id: 10 },
      });
      versionRepo.find = jest.fn().mockResolvedValue([]);
      permissionQuery.getUserPermissions.mockResolvedValue(['api_approve']);

      const result = await service.detail(1, USER_ID);
      expect(result.id).toBe(1);
    });
  });

  // ---- detail — isUpdate flag ----
  describe('detail — isUpdate flag + hasPendingVersion', () => {
    it('returns isUpdate=true when caller is the owner with api_upload', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue({
        id: 1,
        status: ApiPackageStatus.ACTIVE,
        created_by: USER_ID,
        active_version: { id: 10 },
      });
      versionRepo.find = jest.fn().mockResolvedValue([]);
      permissionQuery.getUserPermissions.mockResolvedValue(['api_upload']);

      const result = await service.detail(1, USER_ID);
      expect(result.isUpdate).toBe(true);
    });

    it('returns isUpdate=true when caller is an approver', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue({
        id: 1,
        status: ApiPackageStatus.ACTIVE,
        created_by: OTHER_USER_ID,
        active_version: { id: 10 },
      });
      versionRepo.find = jest.fn().mockResolvedValue([]);
      permissionQuery.getUserPermissions.mockResolvedValue(['api_approve']);

      const result = await service.detail(1, USER_ID);
      expect(result.isUpdate).toBe(true);
    });

    it('returns isUpdate=false when caller is not owner and not approver', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue({
        id: 1,
        status: ApiPackageStatus.ACTIVE,
        created_by: OTHER_USER_ID,
        active_version: { id: 10 },
      });
      versionRepo.find = jest.fn().mockResolvedValue([]);
      permissionQuery.getUserPermissions.mockResolvedValue(['api_upload']);

      const result = await service.detail(1, USER_ID);
      expect(result.isUpdate).toBe(false);
    });

    it('returns hasPendingVersion=true from a SEPARATE count query even though history is approved-only', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue({
        id: 1,
        status: ApiPackageStatus.ACTIVE,
        created_by: USER_ID,
        active_version: { id: 10 },
      });
      // History is approved-only now — the pending version is NOT in this array.
      versionRepo.find = jest.fn().mockResolvedValue([
        { id: 10, version_no: 1, state: ApiVersionState.APPROVED },
      ]);
      versionRepo.count = jest.fn().mockResolvedValue(1);
      permissionQuery.getUserPermissions.mockResolvedValue(['api_upload']);

      const result = await service.detail(1, USER_ID);
      expect(result.hasPendingVersion).toBe(true);
      expect(versionRepo.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ state: ApiVersionState.PENDING }) }),
      );
    });

    it('detail history fetch is filtered to approved-only (id DESC order preserved)', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue({
        id: 1,
        status: ApiPackageStatus.ACTIVE,
        created_by: USER_ID,
        active_version: { id: 10 },
      });
      versionRepo.find = jest.fn().mockResolvedValue([]);
      permissionQuery.getUserPermissions.mockResolvedValue(['api_upload']);

      await service.detail(1, USER_ID);

      expect(versionRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ state: ApiVersionState.APPROVED, is_deleted: false }),
          order: { id: 'DESC' },
        }),
      );
    });

    it('resolves submitted_by_email on active_version; that same row in versions[] stays full', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue({
        id: 1,
        status: ApiPackageStatus.ACTIVE,
        created_by: USER_ID,
        active_version_id: 10,
        active_version: { id: 10, submitted_by: USER_ID },
      });
      versionRepo.find = jest.fn().mockResolvedValue([{ id: 10, version_no: 1, reviewed_at: new Date() }]);
      permissionQuery.getUserPermissions.mockResolvedValue(['api_upload']);
      versionRepo.manager = { query: jest.fn().mockResolvedValue([{ id: USER_ID, email: 'uploader@bank.vn' }]) };

      const result = await service.detail(1, USER_ID);
      expect((result.active_version as any).submitted_by_email).toBe('uploader@bank.vn');
      expect(result.versions[0]).toBe(result.active_version);
    });

    it('returns hasPendingVersion=false when no pending version exists', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue({
        id: 1,
        status: ApiPackageStatus.ACTIVE,
        created_by: USER_ID,
        active_version: { id: 10 },
      });
      versionRepo.find = jest.fn().mockResolvedValue([{ id: 10, version_no: 1, state: ApiVersionState.APPROVED }]);
      permissionQuery.getUserPermissions.mockResolvedValue(['api_upload']);

      const result = await service.detail(1, USER_ID);
      expect(result.hasPendingVersion).toBe(false);
    });
  });

  describe('detail — approved history is a thin timeline for every caller', () => {
    it('returns every approved version as version_no + reviewed_at, including others submissions', async () => {
      const reviewedAt = new Date('2026-03-01T00:00:00.000Z');
      packageRepo.findOne = jest.fn().mockResolvedValue({
        id: 1,
        status: ApiPackageStatus.ACTIVE,
        created_by: OTHER_USER_ID,
        active_version: { id: 10, usage_guide_html: '# active' },
      });
      versionRepo.find = jest.fn().mockResolvedValue([
        { id: 11, version_no: 1, reviewed_at: reviewedAt, usage_guide_html: '# secret' },
        { id: 12, version_no: 2, reviewed_at: null },
      ]);
      permissionQuery.getUserPermissions.mockResolvedValue(['api_upload']);

      const result = await service.detail(1, USER_ID);
      expect(result.versions).toEqual([
        { version_no: 1, reviewed_at: reviewedAt },
        { version_no: 2, reviewed_at: null },
      ]);
      expect((result.versions[0] as any).usage_guide_html).toBeUndefined();
    });

    it('puts the full active version into versions[] and thins older approved rows', async () => {
      const reviewedAt = new Date('2026-01-01T00:00:00.000Z');
      packageRepo.findOne = jest.fn().mockResolvedValue({
        id: 1,
        status: ApiPackageStatus.ACTIVE,
        created_by: USER_ID,
        active_version_id: 12,
        active_version: { id: 12, version_no: 2, usage_guide_html: '# current', submitted_by: USER_ID },
      });
      versionRepo.find = jest.fn().mockResolvedValue([
        { id: 12, version_no: 2, reviewed_at: new Date() },
        { id: 11, version_no: 1, reviewed_at: reviewedAt, usage_guide_html: '# old' },
      ]);
      permissionQuery.getUserPermissions.mockResolvedValue(['api_upload']);

      const result = await service.detail(1, USER_ID);
      expect(result.versions[0]).toBe(result.active_version);
      expect((result.versions[0] as any).usage_guide_html).toBe('# current');
      expect(result.versions[1]).toEqual({ version_no: 1, reviewed_at: reviewedAt });
    });
  });

  // ---- listReviews — approver-only; visibility is the PermissionGuard, not a service check ----
  describe('listReviews — creator / category / sort filters', () => {
    it('unfiltered list has no submitted_by predicate', async () => {
      const qb = makeQueryBuilder();
      versionRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

      await service.listReviews({ page: 1, limit: 20 });

      const joined = qb.capturedWheres.join(' | ');
      expect(joined).toContain('COALESCE(pv.is_deleted, false) = false');
      expect(joined).not.toContain('pv.submitted_by');
    });

    it('applies submitted_by + category_id on page and count', async () => {
      const qb = makeQueryBuilder();
      versionRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

      await service.listReviews({ page: 1, limit: 20, submitted_by: OTHER_USER_ID, category_id: 7 });

      const joined = qb.capturedWheres.join(' | ');
      expect(joined).toContain('pv.submitted_by = :submitted_by');
      expect(joined).toContain('pv.category_id = :category_id');
      expect(qb.capturedParams.submitted_by).toBe(OTHER_USER_ID);
      expect(qb.capturedParams.category_id).toBe(7);
    });

    it('sort=newest orders by created_at DESC, id DESC', async () => {
      const qb = makeQueryBuilder();
      versionRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

      await service.listReviews({ page: 1, limit: 20, sort: 'newest' });

      expect(qb.capturedOrders).toEqual([
        { col: 'pv.created_at', dir: 'DESC' },
        { col: 'pv.id', dir: 'DESC' },
      ]);
    });

    it('sort=oldest orders by created_at ASC, id ASC', async () => {
      const qb = makeQueryBuilder();
      versionRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

      await service.listReviews({ page: 1, limit: 20, sort: 'oldest' });

      expect(qb.capturedOrders).toEqual([
        { col: 'pv.created_at', dir: 'ASC' },
        { col: 'pv.id', dir: 'ASC' },
      ]);
    });

    it('sort=name orders by name ASC, id ASC', async () => {
      const qb = makeQueryBuilder();
      versionRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

      await service.listReviews({ page: 1, limit: 20, sort: 'name' });

      expect(qb.capturedOrders).toEqual([
        { col: 'pv.name', dir: 'ASC' },
        { col: 'pv.id', dir: 'ASC' },
      ]);
    });
  });

  describe('listReviewSubmitters — all pending submitters', () => {
    it('lists every pending submitter with no user bind', async () => {
      versionRepo.manager.query.mockResolvedValue([
        { id: 2, email: 'a@x.com' },
        { id: 3, email: null },
      ]);

      const result = await service.listReviewSubmitters();

      expect(versionRepo.manager.query).toHaveBeenCalledWith(expect.stringContaining('FROM api_catalog_versions'));
      expect(result).toEqual({
        data: [
          { id: 2, email: 'a@x.com' },
          { id: 3, email: null },
        ],
      });
    });
  });

  describe('versionDetail — submitter, package creator, or approver', () => {
    const makeVersion = (overrides: Record<string, unknown> = {}) => ({
      id: VERSION_ID,
      api_catalog_package_id: PACKAGE_ID,
      submitted_by: OTHER_USER_ID,
      state: ApiVersionState.PENDING,
      old_version: 1,
      version_no: 1,
      usage_guide_html: '# incoming',
      reject_reason: null,
      ...overrides,
    });

    it.each([
      ['submitter', USER_ID, OTHER_USER_ID, [], false],
      ['package creator', OTHER_USER_ID, USER_ID, [], false],
      ['approver', OTHER_USER_ID, OTHER_USER_ID, ['api_approve'], true],
    ])('allows %s and returns pending predecessor comparison', async (_label, submitter, creator, codes, canReview) => {
      versionRepo.findOne = jest
        .fn()
        .mockResolvedValueOnce(makeVersion({ submitted_by: submitter }))
        .mockResolvedValueOnce({ id: 8, version_no: 1, usage_guide_html: '# predecessor' });
      packageRepo.findOne = jest.fn().mockResolvedValue({
        id: PACKAGE_ID,
        code: 'prompt_1',
        status: ApiPackageStatus.ACTIVE,
        active_version_id: 8,
        created_by: creator,
      });
      permissionQuery.getUserPermissions.mockResolvedValue(codes);

      const result = await service.versionDetail(VERSION_ID, USER_ID);

      expect(result.comparison?.base_version_id).toBe(8);
      expect(result.comparison?.base_version_no).toBe(1);
      expect(result.comparison?.base).toContain('# predecessor');
      expect(result.comparison?.incoming).toContain('# incoming');
      expect(result.can_review).toBe(canReview);
      expect(result.package).toEqual({
        id: PACKAGE_ID,
        code: 'prompt_1',
        status: ApiPackageStatus.ACTIVE,
        active_version_id: 8,
        created_by: creator,
        // Package metadata rides every read surface; empty here because the mock resolves no rows.
        publisher: null,
        responsible_users: [],
      });
      expect(versionRepo.findOne).toHaveBeenLastCalledWith({
        where: {
          api_catalog_package_id: PACKAGE_ID,
          version_no: 1,
          state: ApiVersionState.APPROVED,
          is_deleted: false,
          deleted_at: expect.anything(),
        },
      });
      expect(result.version.usage_guide_html).toBe('# incoming');
    });

    it('denies a caller outside the access union', async () => {
      versionRepo.findOne = jest.fn().mockResolvedValue(makeVersion());
      packageRepo.findOne = jest.fn().mockResolvedValue({ id: PACKAGE_ID, created_by: OTHER_USER_ID });
      permissionQuery.getUserPermissions.mockResolvedValue([]);

      await expect(service.versionDetail(VERSION_ID, USER_ID)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('returns first pending with null base and no predecessor lookup', async () => {
      versionRepo.findOne = jest.fn().mockResolvedValue(makeVersion({ submitted_by: USER_ID, old_version: null }));
      packageRepo.findOne = jest.fn().mockResolvedValue({ id: PACKAGE_ID, created_by: USER_ID });
      permissionQuery.getUserPermissions.mockResolvedValue([]);

      const result = await service.versionDetail(VERSION_ID, USER_ID);

      expect(result.comparison?.base).toBeNull();
      expect(result.comparison?.incoming).toContain('# incoming');
      expect(versionRepo.findOne).toHaveBeenCalledTimes(1);
    });

    it('fails closed when a declared approved predecessor is missing', async () => {
      versionRepo.findOne = jest.fn().mockResolvedValueOnce(makeVersion({ submitted_by: USER_ID })).mockResolvedValueOnce(null);
      packageRepo.findOne = jest.fn().mockResolvedValue({ id: PACKAGE_ID, created_by: USER_ID });
      permissionQuery.getUserPermissions.mockResolvedValue([]);

      await expect(service.versionDetail(VERSION_ID, USER_ID)).rejects.toBeInstanceOf(ConflictException);
    });

    it.each([ApiVersionState.APPROVED, ApiVersionState.REJECTED])(
      '%s returns full detail without comparison or review capability',
      async (state) => {
        versionRepo.findOne = jest.fn().mockResolvedValue(
          makeVersion({ submitted_by: USER_ID, state, reject_reason: state === ApiVersionState.REJECTED ? 'Fix it' : null }),
        );
        packageRepo.findOne = jest.fn().mockResolvedValue({ id: PACKAGE_ID, created_by: USER_ID });
        permissionQuery.getUserPermissions.mockResolvedValue(['api_approve']);

        const result = await service.versionDetail(VERSION_ID, USER_ID);

        expect(result.comparison).toBeNull();
        expect(result.can_review).toBe(false);
        expect(result.version.reject_reason).toBe(state === ApiVersionState.REJECTED ? 'Fix it' : null);
      },
    );

    it('denies a deleted/missing target or package', async () => {
      versionRepo.findOne = jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(makeVersion());
      await expect(service.versionDetail(VERSION_ID, USER_ID)).rejects.toBeInstanceOf(NotFoundException);

      packageRepo.findOne = jest.fn().mockResolvedValue(null);
      await expect(service.versionDetail(VERSION_ID, USER_ID)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ---- getDiff — row-ownership ----
  describe('getDiff — owner or approver only', () => {
    const makeVersion = (
      overrides: Partial<{ submitted_by: number; state: string; api_catalog_package_id: number }> = {},
    ) => ({
      id: VERSION_ID,
      api_catalog_package_id: PACKAGE_ID,
      submitted_by: USER_ID,
      state: ApiVersionState.PENDING,
      usage_guide_html: '# incoming',
      version_no: 2,
      name: 'v2',
      avatar_url: '/uploads/icon.png',
      category_id: 1,
      tags: [],
      changelog_note: null,
      created_at: new Date(),
      ...overrides,
    });

    it('non-owner non-approver → ForbiddenException', async () => {
      versionRepo.findOne = jest.fn().mockResolvedValue(makeVersion({ submitted_by: OTHER_USER_ID }));
      permissionQuery.getUserPermissions.mockResolvedValue(['api_upload']); // no approve
      packageRepo.findOne = jest.fn().mockResolvedValue({ id: PACKAGE_ID, created_by: OTHER_USER_ID });

      await expect(service.getDiff(VERSION_ID, USER_ID)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('package creator without submitter/approver → allowed', async () => {
      versionRepo.findOne = jest.fn().mockResolvedValue(makeVersion({ submitted_by: OTHER_USER_ID }));
      permissionQuery.getUserPermissions.mockResolvedValue([]);
      packageRepo.findOne = jest.fn().mockResolvedValue({
        id: PACKAGE_ID,
        created_by: USER_ID,
        active_version_id: null,
      });

      await expect(service.getDiff(VERSION_ID, USER_ID)).resolves.toBeDefined();
    });

    it('owner (submitted_by = me) without approver code → allowed', async () => {
      versionRepo.findOne = jest.fn().mockResolvedValue(makeVersion({ submitted_by: USER_ID }));
      permissionQuery.getUserPermissions.mockResolvedValue([]);
      packageRepo.findOne = jest.fn().mockResolvedValue({ id: PACKAGE_ID, active_version_id: null });

      await expect(service.getDiff(VERSION_ID, USER_ID)).resolves.toBeDefined();
    });

    it('approver without ownership → allowed', async () => {
      versionRepo.findOne = jest.fn().mockResolvedValue(makeVersion({ submitted_by: OTHER_USER_ID }));
      permissionQuery.getUserPermissions.mockResolvedValue(['api_approve']);
      packageRepo.findOne = jest.fn().mockResolvedValue({ id: PACKAGE_ID, active_version_id: null });

      await expect(service.getDiff(VERSION_ID, USER_ID)).resolves.toBeDefined();
    });

    it('not found → NotFoundException', async () => {
      versionRepo.findOne = jest.fn().mockResolvedValue(null);
      await expect(service.getDiff(999, USER_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('base is null when package has no active_version_id', async () => {
      versionRepo.findOne = jest.fn().mockResolvedValue(makeVersion());
      permissionQuery.getUserPermissions.mockResolvedValue([]);
      packageRepo.findOne = jest.fn().mockResolvedValue({ id: PACKAGE_ID, active_version_id: null });

      const result = await service.getDiff(VERSION_ID, USER_ID);
      expect(result.base).toBeNull();
      expect(result.incoming).toContain('# incoming');
    });

    it('base = active version spec when a different version is currently active', async () => {
      const ACTIVE_VID = 8;
      versionRepo.findOne = jest.fn().mockImplementation(async ({ where }: any) => {
        if (where.id === VERSION_ID) return makeVersion();
        if (where.id === ACTIVE_VID) return { id: ACTIVE_VID, usage_guide_html: '# base' };
        return null;
      });
      permissionQuery.getUserPermissions.mockResolvedValue(['api_approve']);
      packageRepo.findOne = jest
        .fn()
        .mockResolvedValue({ id: PACKAGE_ID, code: 'prompt_7', active_version_id: ACTIVE_VID });

      const result = await service.getDiff(VERSION_ID, USER_ID);
      expect(result.base).toContain('# base');
      expect(result.incoming).toContain('# incoming');
      expect(result.metadata).toMatchObject({
        version_id: VERSION_ID,
        version_no: 2,
        name: 'v2',
        code: 'prompt_7',
        avatar_url: '/uploads/icon.png',
      });
    });

    it('metadata.code is null when the package row is missing', async () => {
      versionRepo.findOne = jest.fn().mockResolvedValue(makeVersion());
      permissionQuery.getUserPermissions.mockResolvedValue([]);
      packageRepo.findOne = jest.fn().mockResolvedValue(null);

      const result = await service.getDiff(VERSION_ID, USER_ID);
      expect(result.metadata.code).toBeNull();
    });
  });

  // ---- listVersions — flat version-management list, permission-driven visibility ----
  describe('listVersions — visibility from permission set (C1), thin projection, filters', () => {
    function stub(opts: { count?: number; rows?: any[]; codes?: any[]; emails?: any[] } = {}) {
      const { count = 0, rows = [], codes = [], emails = [] } = opts;
      const query = jest.fn().mockImplementation(async (sql: string) => {
        if (/DISTINCT ON \(p\.code\)/.test(sql)) return codes;
        if (/COUNT\(\*\)::int/.test(sql)) return [{ total: count }];
        if (/SELECT id, email FROM users/.test(sql)) return emails;
        return rows;
      });
      versionRepo.manager = { query };
      return query;
    }

    function rawRow(over: Record<string, unknown> = {}) {
      return {
        package_id: 1,
        code: 'prompt_1',
        version_id: 10,
        package_name: 'My Prompt',
        old_version: null,
        version_no: 1,
        state: ApiVersionState.PENDING,
        submitted_by: USER_ID,
        created_at: new Date(),
        avatar_url: '/uploads/icon.png',
        ...over,
      };
    }

    it('non-approver → own-scope predicate (submitted_by OR created_by) applied', async () => {
      permissionQuery.getUserPermissions.mockResolvedValue(['api_upload']);
      const query = stub({ count: 1, rows: [rawRow()] });

      await service.listVersions({ page: 1, pageSize: 20, state: 'all' }, USER_ID);

      const sqls = query.mock.calls.map((c) => c[0] as string).join(' || ');
      expect(sqls).toContain('v.submitted_by = $1 OR p.created_by = $1');
    });

    it('approver → STILL own-scoped ("My Version" — role does not widen visibility)', async () => {
      permissionQuery.getUserPermissions.mockResolvedValue(['api_approve']);
      const query = stub({ count: 0, rows: [] });

      await service.listVersions({ page: 1, pageSize: 20, state: 'all' }, USER_ID);

      const sqls = query.mock.calls.map((c) => c[0] as string).join(' || ');
      // Own-scope predicate applied for everyone, approver included — no "see all" here.
      expect(sqls).toContain('v.submitted_by = $1 OR p.created_by = $1');
    });

    it('api_catalog_package_id can never widen scope: passing package ids stays own-scoped', async () => {
      permissionQuery.getUserPermissions.mockResolvedValue(['api_upload']);
      const query = stub({ count: 0, rows: [] });

      await service.listVersions({ api_catalog_package_id: [7, 8], state: 'all' }, USER_ID);

      const sqls = query.mock.calls.map((c) => c[0] as string).join(' || ');
      // Own-scope predicate is unconditional; the id filter only narrows within own-scope.
      expect(sqls).toContain('v.submitted_by = $1 OR p.created_by = $1');
      expect(sqls).toContain('p.id = ANY($2)');
    });

    it('thin projection: rows carry NO content (usage_guide_html / reject_reason absent)', async () => {
      permissionQuery.getUserPermissions.mockResolvedValue(['api_approve']);
      stub({ count: 1, rows: [rawRow({ version_no: 2, old_version: 1, state: ApiVersionState.APPROVED })] });

      const result = await service.listVersions({ state: 'all' }, USER_ID);
      const row = result.data[0] as any;
      expect(row.usage_guide_html).toBeUndefined();
      expect(row.reject_reason).toBeUndefined();
      expect(row).toMatchObject({
        code: 'prompt_1',
        old_version: 1,
        version_no: 2,
        state: ApiVersionState.APPROVED,
        avatar_url: '/uploads/icon.png',
      });
    });

    it('is_first_pending = true only for a first-ever pending (pending AND old_version=null)', async () => {
      permissionQuery.getUserPermissions.mockResolvedValue(['api_approve']);
      stub({
        count: 3,
        rows: [
          rawRow({ version_id: 10, state: ApiVersionState.PENDING, old_version: null }),
          rawRow({ version_id: 11, state: ApiVersionState.PENDING, old_version: 1 }),
          rawRow({ version_id: 12, state: ApiVersionState.APPROVED, old_version: null, version_no: 1 }),
        ],
      });

      const result = await service.listVersions({ state: 'all' }, USER_ID);
      const byId = Object.fromEntries(result.data.map((r) => [r.version_id, r.is_first_pending]));
      expect(byId[10]).toBe(true);
      expect(byId[11]).toBe(false);
      expect(byId[12]).toBe(false);
    });

    it('id + state filters and created_at sort are applied; total from count', async () => {
      permissionQuery.getUserPermissions.mockResolvedValue(['api_approve']);
      const query = stub({ count: 5, rows: [rawRow()] });

      const result = await service.listVersions(
        { api_catalog_package_id: [1, 2], state: 'pending', page: 2, pageSize: 10, sort: 'newest' },
        USER_ID,
      );

      const sqls = query.mock.calls.map((c) => c[0] as string).join(' || ');
      // $1 is the always-applied own-scope userId; the id filter/state shift to $2/$3.
      expect(sqls).toContain('p.id = ANY($2)');
      expect(sqls).toContain('v.state = $3');
      expect(sqls).toContain('ORDER BY v.created_at DESC');
      expect(sqls).toContain('v.avatar_url');
      expect(result.meta).toEqual({ total: 5, page: 2, limit: 10 });
    });

    it('codesOnly returns distinct {package_id, code, package_name} under the SAME visibility predicate', async () => {
      permissionQuery.getUserPermissions.mockResolvedValue(['api_upload']);
      const query = stub({ codes: [{ package_id: 42, code: 'prompt_1', package_name: 'My Prompt' }] });

      const result = await service.listVersions({ codesOnly: true }, USER_ID);

      expect(result).toEqual({ data: [{ package_id: 42, code: 'prompt_1', package_name: 'My Prompt' }] });
      const codeSql = query.mock.calls.map((c) => c[0] as string).find((s) => /DISTINCT ON \(p\.code\)/.test(s))!;
      // The options select carries the package id so the FE can filter by id.
      expect(codeSql).toContain('p.id AS package_id');
      expect(codeSql).toContain('v.submitted_by = $1 OR p.created_by = $1');
    });

    it('api_catalog_package_id omitted → no id predicate (returns full own-scope)', async () => {
      permissionQuery.getUserPermissions.mockResolvedValue(['api_approve']);
      const query = stub({ count: 1, rows: [rawRow()] });

      await service.listVersions({ state: 'all' }, USER_ID);

      const sqls = query.mock.calls.map((c) => c[0] as string).join(' || ');
      expect(sqls).not.toContain('p.id = ANY');
    });
  });

});
