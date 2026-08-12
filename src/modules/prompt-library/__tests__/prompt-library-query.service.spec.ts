import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PromptLibraryQueryService } from '../prompt-library-query.service';
import { PromptPackageStatus } from '@modules/databases/prompt-package.entity';
import { PromptVersionState } from '@modules/databases/prompt-version.entity';
import { ReviewScope } from '../dto/review-query.dto';

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
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockImplementation(() => Promise.resolve(currentResultRows)),
    getCount: jest.fn().mockResolvedValue(0),
    getRawOne: jest.fn().mockImplementation(() => Promise.resolve({ count: currentCountValue })),
    capturedWheres,
    capturedParams,
    _setResults: (rows: unknown[], count: string) => {
      currentResultRows = rows;
      currentCountValue = count;
    },
  };
  return qb;
}

describe('PromptLibraryQueryService', () => {
  let service: PromptLibraryQueryService;
  let packageRepo: any;
  let versionRepo: any;
  let permissionQuery: any;

  beforeEach(() => {
    jest.clearAllMocks();
    permissionQuery = { getUserPermissions: jest.fn() };
    packageRepo = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
    };
    versionRepo = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      // Default manager for the submitter-email resolver (SELECT id,email FROM users). Empty →
      // submitted_by_email resolves to null. Tests needing real emails override manager.query.
      manager: { query: jest.fn().mockResolvedValue([]) },
    };
    service = new PromptLibraryQueryService(packageRepo, versionRepo, permissionQuery);
  });

  // ---- list ----
  describe('list — active-only filter + sort + limit cap', () => {
    it('emits active-only WHERE and id DESC sort; limit capped at 100', async () => {
      const qb = makeQueryBuilder();
      packageRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

      await service.list({ page: 1, limit: 200, search: undefined });

      const joined = qb.capturedWheres.join(' | ');
      expect(joined).toContain('pkg.status = :status');
      expect(qb.capturedParams.status).toBe(PromptPackageStatus.ACTIVE);
      expect(joined).toContain('pkg.active_version_id IS NOT NULL');
      expect(qb.orderBy).toHaveBeenCalledWith('pkg.id', 'DESC');
      expect(qb.take).toHaveBeenCalledWith(100);
    });

    it('search filter is parameter-bound (not string-concatenated)', async () => {
      const qb = makeQueryBuilder();
      packageRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

      await service.list({ page: 1, limit: 10, search: 'hello world' });

      const joined = qb.capturedWheres.join(' | ');
      expect(joined).toContain('ILIKE :search');
      expect(qb.capturedParams.search).toContain('hello world');
    });

    it('tags filter uses jsonb @> bound parameter', async () => {
      const qb = makeQueryBuilder();
      packageRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

      await service.list({ page: 1, limit: 10, tags: ['nestjs', 'api'] });

      const joined = qb.capturedWheres.join(' | ');
      expect(joined).toContain('av.tags @> :tags::jsonb');
      const parsed = JSON.parse(qb.capturedParams.tags as string);
      expect(parsed).toEqual(['nestjs', 'api']);
    });

    it('returns {data, meta:{total, page, limit}} shape', async () => {
      const qb = makeQueryBuilder([{ id: 1 }], '5');
      packageRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

      const result = await service.list({ page: 2, limit: 5 });

      expect(result).toMatchObject({ data: [{ id: 1 }], meta: { total: 5, page: 2, limit: 5 } });
    });

    it('returns the active_version verbatim (inline prompt_content, no file fold)', async () => {
      const activeVersion = {
        id: 7,
        name: 'My Prompt',
        avatar_url: '/uploads/avatar.png',
        prompt_content: 'Write a haiku.',
      };
      const pkg = { id: 1, active_version: activeVersion };
      const qb = makeQueryBuilder([pkg], '1');
      packageRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

      const result = await service.list({ page: 1, limit: 10 });

      const av = result.data[0].active_version as any;
      expect(av.avatar_url).toBe('/uploads/avatar.png');
      expect(av.prompt_content).toBe('Write a haiku.');
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
        prompt_content: '# active',
      };
      packageRepo.findOne = jest.fn().mockResolvedValue({
        id: 1,
        status: 'active',
        is_deleted: false,
        created_by: USER_ID,
        active_version: activeVersion,
      });
      versionRepo.find = jest
        .fn()
        .mockResolvedValue([{ id: 11, version_no: 1, state: PromptVersionState.APPROVED, prompt_content: '# v1' }]);
      permissionQuery.getUserPermissions.mockResolvedValue([]);

      const result = await service.detail(1, USER_ID);

      expect((result.active_version as any).avatar_url).toBe('/uploads/a.png');
      expect((result.active_version as any).prompt_content).toBe('# active');
      expect((result.active_version as any).file).toBeUndefined();
      expect((result.versions[0] as any).prompt_content).toBe('# v1');
      // Only the active_version relation is loaded (no files relation).
      expect(packageRepo.findOne).toHaveBeenCalledWith(expect.objectContaining({ relations: ['active_version'] }));
      // history versions load with no relations argument (plain rows).
      const findArg = versionRepo.find.mock.calls[0][0];
      expect(findArg.relations).toBeUndefined();
    });

    it('throws NotFound when the package is missing', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue(null);
      await expect(service.detail(999, USER_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFound when the package is inactive and caller is not owner or approver', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue({
        id: 1,
        status: PromptPackageStatus.INACTIVE,
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
        status: PromptPackageStatus.INACTIVE,
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
        status: PromptPackageStatus.INACTIVE,
        is_deleted: false,
        created_by: OTHER_USER_ID,
        active_version: { id: 10 },
      });
      versionRepo.find = jest.fn().mockResolvedValue([]);
      permissionQuery.getUserPermissions.mockResolvedValue(['prompt_approve']);

      const result = await service.detail(1, USER_ID);
      expect(result.id).toBe(1);
    });
  });

  // ---- detail — isUpdate flag ----
  describe('detail — isUpdate flag + hasPendingVersion', () => {
    it('returns isUpdate=true when caller is the owner with prompt_upload', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue({
        id: 1,
        status: PromptPackageStatus.ACTIVE,
        created_by: USER_ID,
        active_version: { id: 10 },
      });
      versionRepo.find = jest.fn().mockResolvedValue([]);
      permissionQuery.getUserPermissions.mockResolvedValue(['prompt_upload']);

      const result = await service.detail(1, USER_ID);
      expect(result.isUpdate).toBe(true);
    });

    it('returns isUpdate=true when caller is an approver', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue({
        id: 1,
        status: PromptPackageStatus.ACTIVE,
        created_by: OTHER_USER_ID,
        active_version: { id: 10 },
      });
      versionRepo.find = jest.fn().mockResolvedValue([]);
      permissionQuery.getUserPermissions.mockResolvedValue(['prompt_approve']);

      const result = await service.detail(1, USER_ID);
      expect(result.isUpdate).toBe(true);
    });

    it('returns isUpdate=false when caller is not owner and not approver', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue({
        id: 1,
        status: PromptPackageStatus.ACTIVE,
        created_by: OTHER_USER_ID,
        active_version: { id: 10 },
      });
      versionRepo.find = jest.fn().mockResolvedValue([]);
      permissionQuery.getUserPermissions.mockResolvedValue(['prompt_upload']);

      const result = await service.detail(1, USER_ID);
      expect(result.isUpdate).toBe(false);
    });

    it('returns hasPendingVersion=true when a pending version exists', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue({
        id: 1,
        status: PromptPackageStatus.ACTIVE,
        created_by: USER_ID,
        active_version: { id: 10 },
      });
      versionRepo.find = jest.fn().mockResolvedValue([
        { id: 11, version_no: 2, state: PromptVersionState.PENDING },
        { id: 10, version_no: 1, state: PromptVersionState.APPROVED },
      ]);
      permissionQuery.getUserPermissions.mockResolvedValue(['prompt_upload']);

      const result = await service.detail(1, USER_ID);
      expect(result.hasPendingVersion).toBe(true);
    });

    it('resolves submitted_by_email on active_version and history versions', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue({
        id: 1,
        status: PromptPackageStatus.ACTIVE,
        created_by: USER_ID,
        active_version: { id: 10, submitted_by: USER_ID },
      });
      versionRepo.find = jest
        .fn()
        .mockResolvedValue([{ id: 10, version_no: 1, state: PromptVersionState.APPROVED, submitted_by: USER_ID }]);
      permissionQuery.getUserPermissions.mockResolvedValue(['prompt_upload']);
      versionRepo.manager = { query: jest.fn().mockResolvedValue([{ id: USER_ID, email: 'uploader@bank.vn' }]) };

      const result = await service.detail(1, USER_ID);
      expect((result.active_version as any).submitted_by_email).toBe('uploader@bank.vn');
      expect((result.versions[0] as any).submitted_by_email).toBe('uploader@bank.vn');
      expect((result.versions[0] as any).submitted_by).toBe(USER_ID);
    });

    it('returns hasPendingVersion=false when no pending version exists', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue({
        id: 1,
        status: PromptPackageStatus.ACTIVE,
        created_by: USER_ID,
        active_version: { id: 10 },
      });
      versionRepo.find = jest.fn().mockResolvedValue([{ id: 10, version_no: 1, state: PromptVersionState.APPROVED }]);
      permissionQuery.getUserPermissions.mockResolvedValue(['prompt_upload']);

      const result = await service.detail(1, USER_ID);
      expect(result.hasPendingVersion).toBe(false);
    });
  });

  // ---- detail — content scrubbing ----
  describe('detail — content scrubbing for non-owner non-approver', () => {
    it('owner sees full content on non-approved versions (pending/rejected)', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue({
        id: 1,
        status: PromptPackageStatus.ACTIVE,
        created_by: USER_ID,
        active_version: { id: 10, state: PromptVersionState.APPROVED, prompt_content: '# active' },
      });
      versionRepo.find = jest.fn().mockResolvedValue([
        {
          id: 11,
          version_no: 2,
          state: PromptVersionState.PENDING,
          prompt_content: '# pending',
          reject_reason: null,
        },
      ]);
      permissionQuery.getUserPermissions.mockResolvedValue(['prompt_upload']);

      const result = await service.detail(1, USER_ID);
      const pending = result.versions[0] as any;
      expect(pending.prompt_content).toBe('# pending');
      expect(pending.reject_reason).toBeNull();
    });

    it('approver sees full content on non-approved versions (pending/rejected)', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue({
        id: 1,
        status: PromptPackageStatus.ACTIVE,
        created_by: OTHER_USER_ID,
        active_version: { id: 10, state: PromptVersionState.APPROVED, prompt_content: '# active' },
      });
      versionRepo.find = jest.fn().mockResolvedValue([
        {
          id: 11,
          version_no: 2,
          state: PromptVersionState.PENDING,
          prompt_content: '# pending',
          reject_reason: null,
        },
      ]);
      permissionQuery.getUserPermissions.mockResolvedValue(['prompt_approve']);

      const result = await service.detail(1, USER_ID);
      const pending = result.versions[0] as any;
      expect(pending.prompt_content).toBe('# pending');
      expect(pending.reject_reason).toBeNull();
    });

    it('non-owner non-approver receives scrubbed content (empty prompt_content, null reject_reason) on pending versions', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue({
        id: 1,
        status: PromptPackageStatus.ACTIVE,
        created_by: OTHER_USER_ID,
        active_version: { id: 10, state: PromptVersionState.APPROVED, prompt_content: '# active' },
      });
      versionRepo.find = jest.fn().mockResolvedValue([
        {
          id: 11,
          version_no: 2,
          state: PromptVersionState.PENDING,
          prompt_content: '# pending',
          reject_reason: null,
        },
      ]);
      permissionQuery.getUserPermissions.mockResolvedValue(['prompt_upload']);

      const result = await service.detail(1, USER_ID);
      const pending = result.versions[0] as any;
      expect(pending.prompt_content).toBe('');
      expect(pending.reject_reason).toBeNull();
    });

    it('non-owner non-approver receives scrubbed content on rejected versions', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue({
        id: 1,
        status: PromptPackageStatus.ACTIVE,
        created_by: OTHER_USER_ID,
        active_version: { id: 10, state: PromptVersionState.APPROVED, prompt_content: '# active' },
      });
      versionRepo.find = jest.fn().mockResolvedValue([
        {
          id: 11,
          version_no: 2,
          state: PromptVersionState.REJECTED,
          prompt_content: '# rejected',
          reject_reason: 'needs work',
        },
      ]);
      permissionQuery.getUserPermissions.mockResolvedValue([]);

      const result = await service.detail(1, USER_ID);
      const rejected = result.versions[0] as any;
      expect(rejected.prompt_content).toBe('');
      expect(rejected.reject_reason).toBeNull();
    });

    it('all callers see full content on approved versions', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue({
        id: 1,
        status: PromptPackageStatus.ACTIVE,
        created_by: OTHER_USER_ID,
        active_version: { id: 10, state: PromptVersionState.APPROVED, prompt_content: '# active' },
      });
      versionRepo.find = jest.fn().mockResolvedValue([
        {
          id: 10,
          version_no: 1,
          state: PromptVersionState.APPROVED,
          prompt_content: '# active',
          reject_reason: null,
        },
      ]);
      permissionQuery.getUserPermissions.mockResolvedValue([]);

      const result = await service.detail(1, USER_ID);
      const approved = result.versions[0] as any;
      expect(approved.prompt_content).toBe('# active');
      expect(approved.reject_reason).toBeNull();
    });
  });

  // ---- listReviews — scope enforcement ----
  describe('listReviews — non-approver forced to own scope', () => {
    it('non-approver with scope=all → forced submitted_by=me predicate', async () => {
      permissionQuery.getUserPermissions.mockResolvedValue(['prompt_upload']); // no prompt_approve

      const qb = makeQueryBuilder();
      versionRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

      await service.listReviews({ scope: ReviewScope.ALL, page: 1, limit: 20 }, USER_ID);

      const joined = qb.capturedWheres.join(' | ');
      expect(joined).toContain('pv.submitted_by = :userId');
      expect(qb.capturedParams.userId).toBe(USER_ID);
    });

    it('non-approver with scope=mine → also has submitted_by predicate', async () => {
      permissionQuery.getUserPermissions.mockResolvedValue([]);

      const qb = makeQueryBuilder();
      versionRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

      await service.listReviews({ scope: ReviewScope.MINE, page: 1, limit: 10 }, USER_ID);

      const joined = qb.capturedWheres.join(' | ');
      expect(joined).toContain('pv.submitted_by = :userId');
    });

    it('approver with scope=all → NO submitted_by predicate (sees all pending)', async () => {
      permissionQuery.getUserPermissions.mockResolvedValue(['prompt_approve']);

      const qb = makeQueryBuilder();
      versionRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

      await service.listReviews({ scope: ReviewScope.ALL, page: 1, limit: 20 }, USER_ID);

      const joined = qb.capturedWheres.join(' | ');
      expect(joined).not.toContain('pv.submitted_by');
    });

    it('approver with scope=mine → submitted_by predicate still applied', async () => {
      permissionQuery.getUserPermissions.mockResolvedValue(['prompt_approve']);

      const qb = makeQueryBuilder();
      versionRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

      await service.listReviews({ scope: ReviewScope.MINE, page: 1, limit: 20 }, USER_ID);

      const joined = qb.capturedWheres.join(' | ');
      expect(joined).toContain('pv.submitted_by = :userId');
    });
  });

  // ---- getDiff — row-ownership ----
  describe('getDiff — owner or approver only', () => {
    const makeVersion = (
      overrides: Partial<{ submitted_by: number; state: string; prompt_package_id: number }> = {},
    ) => ({
      id: VERSION_ID,
      prompt_package_id: PACKAGE_ID,
      submitted_by: USER_ID,
      state: PromptVersionState.PENDING,
      prompt_content: '# incoming',
      version_no: 2,
      name: 'v2',
      category: 'writing',
      tags: [],
      changelog_note: null,
      created_at: new Date(),
      ...overrides,
    });

    it('non-owner non-approver → ForbiddenException', async () => {
      versionRepo.findOne = jest.fn().mockResolvedValue(makeVersion({ submitted_by: OTHER_USER_ID }));
      permissionQuery.getUserPermissions.mockResolvedValue(['prompt_upload']); // no approve

      await expect(service.getDiff(VERSION_ID, USER_ID)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('owner (submitted_by = me) without approver code → allowed', async () => {
      versionRepo.findOne = jest.fn().mockResolvedValue(makeVersion({ submitted_by: USER_ID }));
      permissionQuery.getUserPermissions.mockResolvedValue([]);
      packageRepo.findOne = jest.fn().mockResolvedValue({ id: PACKAGE_ID, active_version_id: null });

      await expect(service.getDiff(VERSION_ID, USER_ID)).resolves.toBeDefined();
    });

    it('approver without ownership → allowed', async () => {
      versionRepo.findOne = jest.fn().mockResolvedValue(makeVersion({ submitted_by: OTHER_USER_ID }));
      permissionQuery.getUserPermissions.mockResolvedValue(['prompt_approve']);
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
      expect(result.incoming).toBe('# incoming');
    });

    it('base = active version prompt_content when a different version is currently active', async () => {
      const ACTIVE_VID = 8;
      versionRepo.findOne = jest.fn().mockImplementation(async ({ where }: any) => {
        if (where.id === VERSION_ID) return makeVersion();
        if (where.id === ACTIVE_VID) return { id: ACTIVE_VID, prompt_content: '# base' };
        return null;
      });
      permissionQuery.getUserPermissions.mockResolvedValue(['prompt_approve']);
      packageRepo.findOne = jest.fn().mockResolvedValue({ id: PACKAGE_ID, active_version_id: ACTIVE_VID });

      const result = await service.getDiff(VERSION_ID, USER_ID);
      expect(result.base).toBe('# base');
      expect(result.incoming).toBe('# incoming');
      expect(result.metadata).toMatchObject({ version_id: VERSION_ID, version_no: 2, name: 'v2' });
    });
  });

  // ---- listMyItems — owner-scoped, bucketed by latest-version state, SQL-paginated ----
  describe('listMyItems — status bucket on latest version + SQL pagination', () => {
    // Stub the single manager.query round-trip (bucket rows) and expose the mock so tests can
    // assert the emitted SQL / bound params. Prompts carry no files → no second query.
    function stubQuery(bucketRows: any[]) {
      const query = jest.fn().mockResolvedValue(bucketRows);
      versionRepo.manager = { query };
      return query;
    }

    // A latest-version row as returned by the WITH…DISTINCT ON query (joined pkg fields +
    // COUNT(*) OVER() page total). Overridable per test.
    function row(over: Record<string, unknown> = {}) {
      return {
        id: 10,
        prompt_package_id: 1,
        version_no: 1,
        state: PromptVersionState.APPROVED,
        name: 'v1',
        short_description: 'desc',
        category: 'writing',
        tags: [],
        avatar_url: null,
        created_at: new Date(),
        updated_at: new Date(),
        pkg_status: PromptPackageStatus.ACTIVE,
        active_version_id: 10,
        created_by: USER_ID,
        total_count: '1',
        ...over,
      };
    }

    it('scopes to the caller ($1=userId) and binds the status bucket as $2', async () => {
      const query = stubQuery([row({ state: PromptVersionState.PENDING })]);

      await service.listMyItems({ page: 1, limit: 20, status: PromptVersionState.PENDING }, USER_ID);

      const [sql, params] = query.mock.calls[0];
      expect(sql).toContain('DISTINCT ON (v.prompt_package_id)');
      expect(sql).toContain('p.created_by = $1');
      expect(sql).toContain('WHERE state = $2');
      expect(params[0]).toBe(USER_ID);
      expect(params[1]).toBe(PromptVersionState.PENDING);
    });

    it('paginates in SQL: LIMIT/OFFSET params from page/limit; total from COUNT(*) OVER()', async () => {
      const query = stubQuery([row({ total_count: '7' })]);

      const result = await service.listMyItems({ page: 3, limit: 10, status: PromptVersionState.APPROVED }, USER_ID);

      const params = query.mock.calls[0][1];
      expect(params[params.length - 2]).toBe(10);
      expect(params[params.length - 1]).toBe(20);
      expect(result.meta).toEqual({ total: 7, page: 3, limit: 10 });
    });

    it('returns {data, meta:{total, page, limit}} mapped from bucket rows', async () => {
      stubQuery([row()]);

      const result = await service.listMyItems({ page: 1, limit: 20, status: PromptVersionState.APPROVED }, USER_ID);

      expect(result).toMatchObject({ data: expect.any(Array), meta: { total: 1, page: 1, limit: 20 } });
      const item = result.data[0];
      expect(item.id).toBe(1);
      expect(item.status).toBe(PromptPackageStatus.ACTIVE);
      expect(item.latest_state).toBe(PromptVersionState.APPROVED);
      expect(item.version.state).toBe(PromptVersionState.APPROVED);
    });

    it('rejected bucket surfaces the latest (rejected) version, not active_version_id', async () => {
      stubQuery([
        row({ id: 22, version_no: 2, state: PromptVersionState.REJECTED, name: 'v2-reject', active_version_id: 10 }),
      ]);

      const result = await service.listMyItems({ page: 1, limit: 20, status: PromptVersionState.REJECTED }, USER_ID);

      expect(result.data[0].version.name).toBe('v2-reject');
      expect(result.data[0].version.version_no).toBe(2);
      expect(result.data[0].latest_state).toBe(PromptVersionState.REJECTED);
    });

    it('appends a bound search fragment; keyword lowercased + wrapped in wildcards', async () => {
      const query = stubQuery([row({ name: 'API Prompt', short_description: 'api stuff' })]);

      await service.listMyItems({ page: 1, limit: 20, status: PromptVersionState.APPROVED, search: 'API' }, USER_ID);

      const [sql, params] = query.mock.calls[0];
      expect(sql).toContain('lower(name) LIKE');
      expect(sql).toContain('lower(short_description) LIKE');
      expect(params).toContain('%api%');
    });

    it('appends a bound category fragment (lowercased equality)', async () => {
      const query = stubQuery([row({ category: 'data' })]);

      await service.listMyItems(
        { page: 1, limit: 20, status: PromptVersionState.APPROVED, category: 'Data' as any },
        USER_ID,
      );

      const [sql, params] = query.mock.calls[0];
      expect(sql).toContain('lower(category) = ');
      expect(params).toContain('data');
    });

    it('version projection omits prompt_content and reject_reason and has no file field', async () => {
      stubQuery([row({ prompt_content: '# secret' })]);

      const result = await service.listMyItems({ page: 1, limit: 20, status: PromptVersionState.APPROVED }, USER_ID);

      const version = result.data[0].version as any;
      expect(version.prompt_content).toBeUndefined();
      expect(version.reject_reason).toBeUndefined();
      expect(version.file).toBeUndefined();
    });

    it('returns empty data and total=0 when the bucket is empty', async () => {
      stubQuery([]);

      const result = await service.listMyItems({ page: 1, limit: 20, status: PromptVersionState.PENDING }, USER_ID);

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
    });
  });
});
