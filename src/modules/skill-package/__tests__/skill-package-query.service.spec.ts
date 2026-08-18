import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { SkillPackageQueryService } from '../skill-package-query.service';
import { SkillPackageStatus } from '@modules/databases/skill-package.entity';
import { SkillVersionState } from '@modules/databases/skill-version.entity';
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

describe('SkillPackageQueryService', () => {
  let service: SkillPackageQueryService;
  let packageRepo: any;
  let versionRepo: any;
  let permissionQuery: any;

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
    service = new SkillPackageQueryService(packageRepo, versionRepo, permissionQuery);
  });

  describe('stats — latest version per package + independent published count', () => {
    it('maps PostgreSQL aggregate values to numeric workspace counters', async () => {
      versionRepo.manager.query.mockResolvedValue([
        { total: '7', pending: '2', approved: '4', rejected: '1', published: '5' },
      ]);

      await expect(service.stats()).resolves.toEqual({
        data: { total: 7, pending: 2, approved: 4, rejected: 1, published: 5 },
      });

      const sql = versionRepo.manager.query.mock.calls[0][0] as string;
      expect(sql).toContain('DISTINCT ON (v.skill_package_id)');
      expect(sql).toContain('ORDER BY v.skill_package_id, v.id DESC');
      expect(sql).toContain("FILTER (WHERE state = 'pending')");
      expect(sql).toContain('av.id = p.active_version_id');
      expect(sql).toContain('av.skill_package_id = p.id');
      expect(sql).toContain("av.state = 'approved'");
      expect(sql).toContain("p.status = 'active'");
      expect(sql).toContain('v.deleted_at IS NULL AND v.is_deleted = false');
      expect(sql).toContain('p.deleted_at IS NULL AND p.is_deleted = false');
      expect(sql).toContain('av.deleted_at IS NULL');
      expect(sql).toContain('av.is_deleted = false');
      expect(versionRepo.manager.query.mock.calls[0][1]).toBeUndefined();
      expect(sql).not.toContain('submitted_by');
      expect(sql).not.toContain('created_by');
    });

    it('returns zero counters when the aggregate returns no row', async () => {
      versionRepo.manager.query.mockResolvedValue([]);

      await expect(service.stats()).resolves.toEqual({
        data: { total: 0, pending: 0, approved: 0, rejected: 0, published: 0 },
      });
    });
  });

  // ---- list ----
  describe('list — active-only filter + sort + limit cap', () => {
    it('emits active-only WHERE and id DESC sort; limit capped at 100', async () => {
      const qb = makeQueryBuilder();
      packageRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

      await service.list({ page: 1, limit: 200, search: undefined }, USER_ID);

      const joined = qb.capturedWheres.join(' | ');
      // Active-only filter must be present.
      expect(joined).toContain('pkg.status = :status');
      expect(qb.capturedParams.status).toBe(SkillPackageStatus.ACTIVE);
      // active_version_id IS NOT NULL filter must be present.
      expect(joined).toContain('pkg.active_version_id IS NOT NULL');
      // sort
      expect(qb.orderBy).toHaveBeenCalledWith('pkg.id', 'DESC');
      // limit cap: even though 200 was requested, take(100) must be called.
      expect(qb.take).toHaveBeenCalledWith(100);
    });

    it('status defaults to active when omitted', async () => {
      const qb = makeQueryBuilder();
      packageRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);
      permissionQuery.getUserPermissions.mockResolvedValue(['skill_approve']);

      await service.list({ page: 1, limit: 10 }, USER_ID);

      expect(qb.capturedParams.status).toBe(SkillPackageStatus.ACTIVE);
    });

    it('approver may filter status=inactive', async () => {
      const qb = makeQueryBuilder();
      packageRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);
      permissionQuery.getUserPermissions.mockResolvedValue(['skill_approve']);

      await service.list({ page: 1, limit: 10, status: SkillPackageStatus.INACTIVE }, USER_ID);

      // Approver's inactive request is honored on both page + count queries.
      expect(qb.capturedParams.status).toBe(SkillPackageStatus.INACTIVE);
    });

    it('non-approver requesting status=inactive is forced back to active (no leak)', async () => {
      const qb = makeQueryBuilder();
      packageRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);
      permissionQuery.getUserPermissions.mockResolvedValue(['skill_upload']); // not an approver

      await service.list({ page: 1, limit: 10, status: SkillPackageStatus.INACTIVE }, USER_ID);

      // Inactive is approver-only; a non-approver never sees inactive packages via the list.
      expect(qb.capturedParams.status).toBe(SkillPackageStatus.ACTIVE);
    });

    it('search filter is parameter-bound (not string-concatenated)', async () => {
      const qb = makeQueryBuilder();
      packageRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

      await service.list({ page: 1, limit: 10, search: 'hello world' }, USER_ID);

      const joined = qb.capturedWheres.join(' | ');
      expect(joined).toContain('ILIKE :search');
      // Must NOT have raw "hello world" concatenated — param object must hold it.
      expect(qb.capturedParams.search).toContain('hello world');
    });

    it('search also substring-matches the tags array as text (parameter-bound, no subquery)', async () => {
      const qb = makeQueryBuilder();
      packageRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

      await service.list({ page: 1, limit: 10, search: 'happ' }, USER_ID);

      const joined = qb.capturedWheres.join(' | ');
      // Tags jsonb is cast to text and ILIKE'd so "happ" matches tag "happy".
      expect(joined).toContain('av.tags::text ILIKE :search');
      // Must NOT use a correlated subquery — that breaks TypeORM's skip/take DISTINCT rewrite.
      expect(joined).not.toContain('jsonb_array_elements_text');
      expect(joined).not.toContain('EXISTS');
      // Still ORed with name/short_description; reuses the single bound :search param.
      expect(joined).toContain('LOWER(av.name) ILIKE :search');
      expect(qb.capturedParams.search).toContain('happ');
    });

    it('tag-in-search clause is applied to BOTH page and count queries (no total drift)', async () => {
      const qb = makeQueryBuilder();
      packageRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

      await service.list({ page: 1, limit: 10, search: 'happ' }, USER_ID);

      // Mock returns the same builder for page + count createQueryBuilder calls, so the tag
      // clause must appear twice — once per query — or pagination total would diverge.
      const occurrences = qb.capturedWheres.filter((w: string) =>
        w.includes('av.tags::text ILIKE :search'),
      ).length;
      expect(occurrences).toBe(2);
    });

    it('tags filter uses jsonb @> bound parameter', async () => {
      const qb = makeQueryBuilder();
      packageRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

      await service.list({ page: 1, limit: 10, tags: ['nestjs', 'api'] }, USER_ID);

      const joined = qb.capturedWheres.join(' | ');
      expect(joined).toContain('av.tags @> :tags::jsonb');
      const parsed = JSON.parse(qb.capturedParams.tags as string);
      expect(parsed).toEqual(['nestjs', 'api']);
    });

    it('returns {data, meta:{total, page, limit}} shape', async () => {
      const qb = makeQueryBuilder([{ id: 1 }], '5');
      packageRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

      const result = await service.list({ page: 2, limit: 5 }, USER_ID);

      expect(result).toMatchObject({ data: [{ id: 1 }], meta: { total: 5, page: 2, limit: 5 } });
    });

    it('folds the active_version zip into a single `file` object + inline avatar_url; joins the files relation', async () => {
      const activeVersion = {
        id: 7,
        name: 'My Skill',
        avatar_url: '/uploads/avatar.png',
        files: [
          {
            file_kind: 'zip',
            file_url: '/uploads/skill.zip',
            name: 'skill.zip',
            size: 1024,
            mime_type: 'application/zip',
          },
        ],
      };
      const pkg = { id: 1, active_version: activeVersion };
      const qb = makeQueryBuilder([pkg], '1');
      packageRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

      const result = await service.list({ page: 1, limit: 10 }, USER_ID);

      const av = result.data[0].active_version as any;
      // Avatar is a native inline column; the zip is folded to the single `file` object (no raw files[]).
      expect(av.avatar_url).toBe('/uploads/avatar.png');
      expect(av.files).toBeUndefined();
      expect(av.file).toMatchObject({
        file_url: '/uploads/skill.zip',
        name: 'skill.zip',
        size: 1024,
        mime_type: 'application/zip',
      });
      // The files relation is joined (non-deleted rows only — both soft-delete markers).
      expect(qb.leftJoinAndSelect).toHaveBeenCalledWith(
        'av.files',
        'avf',
        'avf.deleted_at IS NULL AND avf.is_deleted = false',
      );
    });

    it('returns an active_version with file=null when the version has no zip file row', async () => {
      const activeVersion = { id: 8, name: 'No File Skill', avatar_url: null, files: [] };
      const pkg = { id: 2, active_version: activeVersion };
      const qb = makeQueryBuilder([pkg], '1');
      packageRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

      const result = await service.list({ page: 1, limit: 10 }, USER_ID);

      const av = result.data[0].active_version as any;
      expect(av.file).toBeNull();
      expect(av.files).toBeUndefined();
    });
  });

  // ---- detail — file object + permission gating ----
  describe('detail — folds files[] into a single `file` on active_version and history versions', () => {
    it('returns a `file` object on active_version and every history version, loading the files relation', async () => {
      const activeVersion = {
        id: 10,
        name: 'AvatarSkill',
        avatar_url: '/uploads/a.png',
        files: [
          { file_kind: 'zip', file_url: '/uploads/v2.zip', name: 'v2.zip', size: 10, mime_type: 'application/zip' },
        ],
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
        .mockResolvedValue([{ id: 11, version_no: 1, files: [{ file_kind: 'zip', file_url: '/uploads/v1.zip' }] }]);
      permissionQuery.getUserPermissions.mockResolvedValue([]);

      const result = await service.detail(1, USER_ID);

      // Avatar inline column + folded single `file` object on active_version (no raw files[]).
      expect((result.active_version as any).avatar_url).toBe('/uploads/a.png');
      expect((result.active_version as any).files).toBeUndefined();
      expect((result.active_version as any).file.file_url).toBe('/uploads/v2.zip');
      expect((result.versions[0] as any).file.file_url).toBe('/uploads/v1.zip');
      // active_version.files is eager-loaded via relations.
      expect(packageRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ relations: ['active_version', 'active_version.files'] }),
      );
      // history versions load their files relation too.
      expect(versionRepo.find).toHaveBeenCalledWith(expect.objectContaining({ relations: ['files'] }));
    });

    it('throws NotFound when the package is missing', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue(null);
      await expect(service.detail(999, USER_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFound when the package is inactive and caller is not owner or approver', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue({
        id: 1,
        status: SkillPackageStatus.INACTIVE,
        is_deleted: false,
        created_by: OTHER_USER_ID,
        active_version: null,
      });
      permissionQuery.getUserPermissions.mockResolvedValue([]);

      await expect(service.detail(1, USER_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('allows owner to view inactive package (permission gate for inactive)', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue({
        id: 1,
        status: SkillPackageStatus.INACTIVE,
        is_deleted: false,
        created_by: USER_ID,
        active_version: { id: 10, files: [] },
      });
      versionRepo.find = jest.fn().mockResolvedValue([]);
      permissionQuery.getUserPermissions.mockResolvedValue([]);

      const result = await service.detail(1, USER_ID);
      expect(result.id).toBe(1);
    });

    it('allows approver to view inactive package (permission gate for inactive)', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue({
        id: 1,
        status: SkillPackageStatus.INACTIVE,
        is_deleted: false,
        created_by: OTHER_USER_ID,
        active_version: { id: 10, files: [] },
      });
      versionRepo.find = jest.fn().mockResolvedValue([]);
      permissionQuery.getUserPermissions.mockResolvedValue(['skill_approve']);

      const result = await service.detail(1, USER_ID);
      expect(result.id).toBe(1);
    });

    it('excludes soft-deleted (is_deleted=true) file rows before folding, on both active_version and history', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue({
        id: 1,
        status: 'active',
        is_deleted: false,
        created_by: USER_ID,
        active_version: {
          id: 10,
          files: [
            { file_kind: 'zip', file_url: '/uploads/live.zip', is_deleted: false },
            { file_kind: 'zip', file_url: '/uploads/gone.zip', is_deleted: true },
          ],
        },
      });
      versionRepo.find = jest.fn().mockResolvedValue([
        {
          id: 11,
          version_no: 1,
          files: [
            { file_kind: 'zip', file_url: '/uploads/v1-live.zip', is_deleted: false },
            { file_kind: 'zip', file_url: '/uploads/v1-gone.zip', is_deleted: true },
          ],
        },
      ]);
      permissionQuery.getUserPermissions.mockResolvedValue([]);

      const result = await service.detail(1, USER_ID);

      // The soft-deleted rows are filtered before folding → `file` reflects the live zip only.
      expect((result.active_version as any).file.file_url).toBe('/uploads/live.zip');
      expect((result.versions[0] as any).file.file_url).toBe('/uploads/v1-live.zip');
    });
  });

  // ---- detail — isUpdate flag ----
  describe('detail — isUpdate flag + hasPendingVersion', () => {
    it('returns isUpdate=true when caller is the owner with skill_upload', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue({
        id: 1,
        status: SkillPackageStatus.ACTIVE,
        created_by: USER_ID,
        active_version: { id: 10, files: [] },
      });
      versionRepo.find = jest.fn().mockResolvedValue([]);
      permissionQuery.getUserPermissions.mockResolvedValue(['skill_upload']);

      const result = await service.detail(1, USER_ID);
      expect(result.isUpdate).toBe(true);
    });

    it('returns isUpdate=true when caller is an approver', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue({
        id: 1,
        status: SkillPackageStatus.ACTIVE,
        created_by: OTHER_USER_ID,
        active_version: { id: 10, files: [] },
      });
      versionRepo.find = jest.fn().mockResolvedValue([]);
      permissionQuery.getUserPermissions.mockResolvedValue(['skill_approve']);

      const result = await service.detail(1, USER_ID);
      expect(result.isUpdate).toBe(true);
    });

    it('returns isUpdate=false when caller is not owner and not approver', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue({
        id: 1,
        status: SkillPackageStatus.ACTIVE,
        created_by: OTHER_USER_ID,
        active_version: { id: 10, files: [] },
      });
      versionRepo.find = jest.fn().mockResolvedValue([]);
      permissionQuery.getUserPermissions.mockResolvedValue(['skill_upload']);

      const result = await service.detail(1, USER_ID);
      expect(result.isUpdate).toBe(false);
    });

    it('returns hasPendingVersion=true from a SEPARATE count query even though history is approved-only', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue({
        id: 1,
        status: SkillPackageStatus.ACTIVE,
        created_by: USER_ID,
        active_version: { id: 10, files: [] },
      });
      // History is approved-only now — the pending version is NOT in this array.
      versionRepo.find = jest.fn().mockResolvedValue([
        { id: 10, version_no: 1, state: SkillVersionState.APPROVED, files: [] },
      ]);
      // The separate EXISTS/COUNT query reports the pending version.
      versionRepo.count = jest.fn().mockResolvedValue(1);
      permissionQuery.getUserPermissions.mockResolvedValue(['skill_upload']);

      const result = await service.detail(1, USER_ID);
      expect(result.hasPendingVersion).toBe(true);
      // Sourced from count, NOT from the approved-only history array.
      expect(versionRepo.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ state: SkillVersionState.PENDING }) }),
      );
    });

    it('detail history fetch is filtered to approved-only (id DESC order preserved)', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue({
        id: 1,
        status: SkillPackageStatus.ACTIVE,
        created_by: USER_ID,
        active_version: { id: 10, files: [] },
      });
      versionRepo.find = jest.fn().mockResolvedValue([]);
      permissionQuery.getUserPermissions.mockResolvedValue(['skill_upload']);

      await service.detail(1, USER_ID);

      expect(versionRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ state: SkillVersionState.APPROVED, is_deleted: false }),
          order: { id: 'DESC' },
        }),
      );
    });

    it('resolves submitted_by_email on active_version and history versions', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue({
        id: 1,
        status: SkillPackageStatus.ACTIVE,
        created_by: USER_ID,
        active_version: { id: 10, submitted_by: USER_ID, files: [] },
      });
      versionRepo.find = jest
        .fn()
        .mockResolvedValue([
          { id: 10, version_no: 1, state: SkillVersionState.APPROVED, submitted_by: USER_ID, files: [] },
        ]);
      permissionQuery.getUserPermissions.mockResolvedValue(['skill_upload']);
      versionRepo.manager = { query: jest.fn().mockResolvedValue([{ id: USER_ID, email: 'uploader@bank.vn' }]) };

      const result = await service.detail(1, USER_ID);
      expect((result.active_version as any).submitted_by_email).toBe('uploader@bank.vn');
      expect((result.versions[0] as any).submitted_by_email).toBe('uploader@bank.vn');
      // numeric id preserved (additive contract)
      expect((result.versions[0] as any).submitted_by).toBe(USER_ID);
    });

    it('returns hasPendingVersion=false when no pending version exists', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue({
        id: 1,
        status: SkillPackageStatus.ACTIVE,
        created_by: USER_ID,
        active_version: { id: 10, files: [] },
      });
      versionRepo.find = jest
        .fn()
        .mockResolvedValue([{ id: 10, version_no: 1, state: SkillVersionState.APPROVED, files: [] }]);
      permissionQuery.getUserPermissions.mockResolvedValue(['skill_upload']);

      const result = await service.detail(1, USER_ID);
      expect(result.hasPendingVersion).toBe(false);
    });
  });

  // ---- detail — content scrubbing ----
  describe('detail — content scrubbing for non-owner non-approver', () => {
    it('owner sees full content on non-approved versions (pending/rejected)', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue({
        id: 1,
        status: SkillPackageStatus.ACTIVE,
        created_by: USER_ID,
        active_version: { id: 10, files: [], state: SkillVersionState.APPROVED, skill_md_content: '# active' },
      });
      versionRepo.find = jest.fn().mockResolvedValue([
        {
          id: 11,
          version_no: 2,
          state: SkillVersionState.PENDING,
          files: [],
          skill_md_content: '# pending',
          reject_reason: null,
        },
      ]);
      permissionQuery.getUserPermissions.mockResolvedValue(['skill_upload']);

      const result = await service.detail(1, USER_ID);
      const pending = result.versions[0] as any;
      expect(pending.skill_md_content).toBe('# pending');
      expect(pending.reject_reason).toBeNull();
    });

    it('approver sees full content on non-approved versions (pending/rejected)', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue({
        id: 1,
        status: SkillPackageStatus.ACTIVE,
        created_by: OTHER_USER_ID,
        active_version: { id: 10, files: [], state: SkillVersionState.APPROVED, skill_md_content: '# active' },
      });
      versionRepo.find = jest.fn().mockResolvedValue([
        {
          id: 11,
          version_no: 2,
          state: SkillVersionState.PENDING,
          files: [],
          skill_md_content: '# pending',
          reject_reason: null,
        },
      ]);
      permissionQuery.getUserPermissions.mockResolvedValue(['skill_approve']);

      const result = await service.detail(1, USER_ID);
      const pending = result.versions[0] as any;
      expect(pending.skill_md_content).toBe('# pending');
      expect(pending.reject_reason).toBeNull();
    });

    it('non-owner non-approver receives scrubbed content (empty skill_md_content, null reject_reason) on pending versions', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue({
        id: 1,
        status: SkillPackageStatus.ACTIVE,
        created_by: OTHER_USER_ID,
        active_version: { id: 10, files: [], state: SkillVersionState.APPROVED, skill_md_content: '# active' },
      });
      versionRepo.find = jest.fn().mockResolvedValue([
        {
          id: 11,
          version_no: 2,
          state: SkillVersionState.PENDING,
          files: [],
          skill_md_content: '# pending',
          reject_reason: null,
        },
      ]);
      permissionQuery.getUserPermissions.mockResolvedValue(['skill_upload']);

      const result = await service.detail(1, USER_ID);
      const pending = result.versions[0] as any;
      expect(pending.skill_md_content).toBe('');
      expect(pending.reject_reason).toBeNull();
    });

    it('non-owner non-approver receives scrubbed content on rejected versions', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue({
        id: 1,
        status: SkillPackageStatus.ACTIVE,
        created_by: OTHER_USER_ID,
        active_version: { id: 10, files: [], state: SkillVersionState.APPROVED, skill_md_content: '# active' },
      });
      versionRepo.find = jest.fn().mockResolvedValue([
        {
          id: 11,
          version_no: 2,
          state: SkillVersionState.REJECTED,
          files: [],
          skill_md_content: '# rejected',
          reject_reason: 'needs work',
        },
      ]);
      permissionQuery.getUserPermissions.mockResolvedValue([]);

      const result = await service.detail(1, USER_ID);
      const rejected = result.versions[0] as any;
      expect(rejected.skill_md_content).toBe('');
      expect(rejected.reject_reason).toBeNull();
    });

    it('all callers see full content on approved versions', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue({
        id: 1,
        status: SkillPackageStatus.ACTIVE,
        created_by: OTHER_USER_ID,
        active_version: { id: 10, files: [], state: SkillVersionState.APPROVED, skill_md_content: '# active' },
      });
      versionRepo.find = jest.fn().mockResolvedValue([
        {
          id: 10,
          version_no: 1,
          state: SkillVersionState.APPROVED,
          files: [],
          skill_md_content: '# active',
          reject_reason: null,
        },
      ]);
      permissionQuery.getUserPermissions.mockResolvedValue([]);

      const result = await service.detail(1, USER_ID);
      const approved = result.versions[0] as any;
      expect(approved.skill_md_content).toBe('# active');
      expect(approved.reject_reason).toBeNull();
    });
  });

  // ---- listReviews — scope enforcement ----
  describe('listReviews — C3: non-approver forced to own scope', () => {
    it('non-approver with scope=all → forced submitted_by=me predicate', async () => {
      permissionQuery.getUserPermissions.mockResolvedValue(['skill_upload']); // no skill_approve

      const qb = makeQueryBuilder();
      versionRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

      await service.listReviews({ scope: ReviewScope.ALL, page: 1, limit: 20 }, USER_ID);

      const joined = qb.capturedWheres.join(' | ');
      // Must include the forced own-scope predicate regardless of client's scope=all.
      expect(joined).toContain('sv.submitted_by = :userId');
      expect(qb.capturedParams.userId).toBe(USER_ID);
    });

    it('non-approver with scope=mine → also has submitted_by predicate', async () => {
      permissionQuery.getUserPermissions.mockResolvedValue([]);

      const qb = makeQueryBuilder();
      versionRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

      await service.listReviews({ scope: ReviewScope.MINE, page: 1, limit: 10 }, USER_ID);

      const joined = qb.capturedWheres.join(' | ');
      expect(joined).toContain('sv.submitted_by = :userId');
    });

    it('approver with scope=all → NO submitted_by predicate (sees all pending)', async () => {
      permissionQuery.getUserPermissions.mockResolvedValue(['skill_approve']);

      const qb = makeQueryBuilder();
      versionRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

      await service.listReviews({ scope: ReviewScope.ALL, page: 1, limit: 20 }, USER_ID);

      const joined = qb.capturedWheres.join(' | ');
      expect(joined).not.toContain('sv.submitted_by');
    });

    it('approver with scope=mine → submitted_by predicate still applied', async () => {
      permissionQuery.getUserPermissions.mockResolvedValue(['skill_approve']);

      const qb = makeQueryBuilder();
      versionRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

      await service.listReviews({ scope: ReviewScope.MINE, page: 1, limit: 20 }, USER_ID);

      const joined = qb.capturedWheres.join(' | ');
      expect(joined).toContain('sv.submitted_by = :userId');
    });
  });

  describe('listReviewSubmitters — same scope as listReviews', () => {
    it('non-approver with scope=all still binds submitted_by = caller', async () => {
      permissionQuery.getUserPermissions.mockResolvedValue(['skill_upload']);
      versionRepo.manager.query.mockResolvedValue([{ id: USER_ID, email: 'me@x.com' }]);

      const result = await service.listReviewSubmitters({ scope: ReviewScope.ALL }, USER_ID);

      expect(versionRepo.manager.query).toHaveBeenCalledWith(expect.stringContaining('FROM skill_versions'), [
        USER_ID,
      ]);
      expect(result).toEqual({ data: [{ id: USER_ID, email: 'me@x.com' }] });
    });

    it('approver with scope=all lists every pending submitter (no user bind)', async () => {
      permissionQuery.getUserPermissions.mockResolvedValue(['skill_approve']);
      versionRepo.manager.query.mockResolvedValue([
        { id: 2, email: 'a@x.com' },
        { id: 3, email: null },
      ]);

      const result = await service.listReviewSubmitters({ scope: ReviewScope.ALL }, USER_ID);

      expect(versionRepo.manager.query).toHaveBeenCalledWith(expect.stringContaining('FROM skill_versions'), [null]);
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
      skill_package_id: PACKAGE_ID,
      submitted_by: OTHER_USER_ID,
      state: SkillVersionState.PENDING,
      old_version: 1,
      version_no: 1,
      skill_md_content: '# incoming',
      reject_reason: null,
      files: [{ file_kind: 'zip', file_url: '/uploads/v2.zip', is_deleted: false }],
      ...overrides,
    });

    it.each([
      ['submitter', USER_ID, OTHER_USER_ID, [], false],
      ['package creator', OTHER_USER_ID, USER_ID, [], false],
      ['approver', OTHER_USER_ID, OTHER_USER_ID, ['skill_approve'], true],
    ])('allows %s and returns pending predecessor comparison', async (_label, submitter, creator, codes, canReview) => {
      versionRepo.findOne = jest
        .fn()
        .mockResolvedValueOnce(makeVersion({ submitted_by: submitter }))
        .mockResolvedValueOnce({ id: 8, version_no: 1, skill_md_content: '# predecessor' });
      packageRepo.findOne = jest.fn().mockResolvedValue({
        id: PACKAGE_ID,
        code: 'skill_1',
        status: SkillPackageStatus.ACTIVE,
        active_version_id: 8,
        created_by: creator,
      });
      permissionQuery.getUserPermissions.mockResolvedValue(codes);

      const result = await service.versionDetail(VERSION_ID, USER_ID);

      expect(result.comparison).toEqual({
        base_version_id: 8,
        base_version_no: 1,
        base: '# predecessor',
        incoming: '# incoming',
      });
      expect(result.can_review).toBe(canReview);
      expect(result.package).toEqual({
        id: PACKAGE_ID,
        code: 'skill_1',
        status: SkillPackageStatus.ACTIVE,
        active_version_id: 8,
        created_by: creator,
      });
      expect(versionRepo.findOne).toHaveBeenLastCalledWith({
        where: {
          skill_package_id: PACKAGE_ID,
          version_no: 1,
          state: SkillVersionState.APPROVED,
          is_deleted: false,
          deleted_at: expect.anything(),
        },
      });
      expect((result.version as any).files).toBeUndefined();
      expect((result.version as any).file).toMatchObject({ file_url: '/uploads/v2.zip' });
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

      expect(result.comparison).toEqual({
        base_version_id: null,
        base_version_no: null,
        base: null,
        incoming: '# incoming',
      });
      expect(versionRepo.findOne).toHaveBeenCalledTimes(1);
    });

    it('fails closed when a declared approved predecessor is missing', async () => {
      versionRepo.findOne = jest.fn().mockResolvedValueOnce(makeVersion({ submitted_by: USER_ID })).mockResolvedValueOnce(null);
      packageRepo.findOne = jest.fn().mockResolvedValue({ id: PACKAGE_ID, created_by: USER_ID });
      permissionQuery.getUserPermissions.mockResolvedValue([]);

      await expect(service.versionDetail(VERSION_ID, USER_ID)).rejects.toBeInstanceOf(ConflictException);
    });

    it.each([SkillVersionState.APPROVED, SkillVersionState.REJECTED])(
      '%s returns full detail without comparison or review capability',
      async (state) => {
        versionRepo.findOne = jest.fn().mockResolvedValue(
          makeVersion({ submitted_by: USER_ID, state, reject_reason: state === SkillVersionState.REJECTED ? 'Fix it' : null }),
        );
        packageRepo.findOne = jest.fn().mockResolvedValue({ id: PACKAGE_ID, created_by: USER_ID });
        permissionQuery.getUserPermissions.mockResolvedValue(['skill_approve']);

        const result = await service.versionDetail(VERSION_ID, USER_ID);

        expect(result.comparison).toBeNull();
        expect(result.can_review).toBe(false);
        expect(result.version?.reject_reason).toBe(state === SkillVersionState.REJECTED ? 'Fix it' : null);
      },
    );

    it('denies a deleted/missing target or package', async () => {
      versionRepo.findOne = jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(makeVersion());
      await expect(service.versionDetail(VERSION_ID, USER_ID)).rejects.toBeInstanceOf(NotFoundException);

      packageRepo.findOne = jest.fn().mockResolvedValue(null);
      await expect(service.versionDetail(VERSION_ID, USER_ID)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ---- getDiff — C4 row-ownership ----
  describe('getDiff — C4: owner or approver only', () => {
    const makeVersion = (
      overrides: Partial<{ submitted_by: number; state: string; skill_package_id: number }> = {},
    ) => ({
      id: VERSION_ID,
      skill_package_id: PACKAGE_ID,
      submitted_by: USER_ID,
      state: SkillVersionState.PENDING,
      skill_md_content: '# incoming',
      version_no: 2,
      name: 'v2',
      category_id: 1,
      tags: [],
      changelog_note: null,
      created_at: new Date(),
      ...overrides,
    });

    it('non-owner non-approver → ForbiddenException', async () => {
      versionRepo.findOne = jest.fn().mockResolvedValue(makeVersion({ submitted_by: OTHER_USER_ID }));
      permissionQuery.getUserPermissions.mockResolvedValue(['skill_upload']); // no approve

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
      permissionQuery.getUserPermissions.mockResolvedValue(['skill_approve']);
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

    it('base = active version skill.md when a different version is currently active', async () => {
      const ACTIVE_VID = 8;
      // First lookup returns the target (incoming) version; second returns the active base version.
      versionRepo.findOne = jest.fn().mockImplementation(async ({ where }: any) => {
        if (where.id === VERSION_ID) return makeVersion();
        if (where.id === ACTIVE_VID) return { id: ACTIVE_VID, skill_md_content: '# base' };
        return null;
      });
      permissionQuery.getUserPermissions.mockResolvedValue(['skill_approve']);
      packageRepo.findOne = jest
        .fn()
        .mockResolvedValue({ id: PACKAGE_ID, code: 'skill_7', active_version_id: ACTIVE_VID });

      const result = await service.getDiff(VERSION_ID, USER_ID);
      expect(result.base).toBe('# base');
      expect(result.incoming).toBe('# incoming');
      expect(result.metadata).toMatchObject({ version_id: VERSION_ID, version_no: 2, name: 'v2', code: 'skill_7' });
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
    // Dispatch manager.query by SQL shape: codesOnly / count / email-resolver / rows.
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
        code: 'skill_1',
        version_id: 10,
        package_name: 'My Skill',
        old_version: null,
        version_no: 1,
        state: SkillVersionState.PENDING,
        submitted_by: USER_ID,
        created_at: new Date(),
        ...over,
      };
    }

    it('non-approver → own-scope predicate (submitted_by OR created_by) applied', async () => {
      permissionQuery.getUserPermissions.mockResolvedValue(['skill_upload']); // no skill_approve
      const query = stub({ count: 1, rows: [rawRow()] });

      await service.listVersions({ page: 1, pageSize: 20, state: 'all' }, USER_ID);

      const sqls = query.mock.calls.map((c) => c[0] as string).join(' || ');
      expect(sqls).toContain('v.submitted_by = $1 OR p.created_by = $1');
    });

    it('approver → STILL own-scoped ("My Version" — role does not widen visibility)', async () => {
      permissionQuery.getUserPermissions.mockResolvedValue(['skill_approve']);
      const query = stub({ count: 0, rows: [] });

      await service.listVersions({ page: 1, pageSize: 20, state: 'all' }, USER_ID);

      const sqls = query.mock.calls.map((c) => c[0] as string).join(' || ');
      // Own-scope predicate applied for everyone, approver included — no "see all" here.
      expect(sqls).toContain('v.submitted_by = $1 OR p.created_by = $1');
    });

    it('skill_package_id can never widen scope: passing package ids stays own-scoped', async () => {
      permissionQuery.getUserPermissions.mockResolvedValue(['skill_upload']);
      const query = stub({ count: 0, rows: [] });

      await service.listVersions({ skill_package_id: [7, 8], state: 'all' }, USER_ID);

      const sqls = query.mock.calls.map((c) => c[0] as string).join(' || ');
      // Own-scope predicate is unconditional; the id filter only narrows within own-scope.
      expect(sqls).toContain('v.submitted_by = $1 OR p.created_by = $1');
      expect(sqls).toContain('p.id = ANY($2)');
    });

    it('thin projection: rows carry NO content (skill_md_content / reject_reason absent)', async () => {
      permissionQuery.getUserPermissions.mockResolvedValue(['skill_approve']);
      stub({ count: 1, rows: [rawRow({ version_no: 2, old_version: 1, state: SkillVersionState.APPROVED })] });

      const result = await service.listVersions({ state: 'all' }, USER_ID);
      const row = result.data[0] as any;
      expect(row.skill_md_content).toBeUndefined();
      expect(row.reject_reason).toBeUndefined();
      expect(row).toMatchObject({ code: 'skill_1', old_version: 1, version_no: 2, state: SkillVersionState.APPROVED });
    });

    it('is_first_pending = true only for a first-ever pending (pending AND old_version=null)', async () => {
      permissionQuery.getUserPermissions.mockResolvedValue(['skill_approve']);
      stub({
        count: 3,
        rows: [
          rawRow({ version_id: 10, state: SkillVersionState.PENDING, old_version: null }),
          rawRow({ version_id: 11, state: SkillVersionState.PENDING, old_version: 1 }),
          rawRow({ version_id: 12, state: SkillVersionState.APPROVED, old_version: null, version_no: 1 }),
        ],
      });

      const result = await service.listVersions({ state: 'all' }, USER_ID);
      const byId = Object.fromEntries(result.data.map((r) => [r.version_id, r.is_first_pending]));
      expect(byId[10]).toBe(true); // first pending
      expect(byId[11]).toBe(false); // update pending
      expect(byId[12]).toBe(false); // approved first
    });

    it('id + state filters and created_at sort are applied; total from count', async () => {
      permissionQuery.getUserPermissions.mockResolvedValue(['skill_approve']);
      const query = stub({ count: 5, rows: [rawRow()] });

      const result = await service.listVersions(
        { skill_package_id: [1, 2], state: 'pending', page: 2, pageSize: 10, sort: 'newest' },
        USER_ID,
      );

      const sqls = query.mock.calls.map((c) => c[0] as string).join(' || ');
      // $1 is the always-applied own-scope userId; the id filter/state shift to $2/$3.
      expect(sqls).toContain('p.id = ANY($2)');
      expect(sqls).toContain('v.state = $3');
      expect(sqls).toContain('ORDER BY v.created_at DESC');
      expect(result.meta).toEqual({ total: 5, page: 2, limit: 10 });
    });

    it('codesOnly returns distinct {package_id, code, package_name} under the SAME visibility predicate', async () => {
      permissionQuery.getUserPermissions.mockResolvedValue(['skill_upload']); // non-approver
      const query = stub({ codes: [{ package_id: 42, code: 'skill_1', package_name: 'My Skill' }] });

      const result = await service.listVersions({ codesOnly: true }, USER_ID);

      expect(result).toEqual({ data: [{ package_id: 42, code: 'skill_1', package_name: 'My Skill' }] });
      const codeSql = query.mock.calls.map((c) => c[0] as string).find((s) => /DISTINCT ON \(p\.code\)/.test(s))!;
      // The options select carries the package id so the FE can filter by id.
      expect(codeSql).toContain('p.id AS package_id');
      // Identical own-scope visibility predicate as the list mode.
      expect(codeSql).toContain('v.submitted_by = $1 OR p.created_by = $1');
    });

    it('skill_package_id omitted → no id predicate (returns full own-scope)', async () => {
      permissionQuery.getUserPermissions.mockResolvedValue(['skill_approve']);
      const query = stub({ count: 1, rows: [rawRow()] });

      await service.listVersions({ state: 'all' }, USER_ID);

      const sqls = query.mock.calls.map((c) => c[0] as string).join(' || ');
      expect(sqls).not.toContain('p.id = ANY');
    });
  });

});
