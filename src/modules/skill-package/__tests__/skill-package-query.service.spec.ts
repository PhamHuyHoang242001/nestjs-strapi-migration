import { ForbiddenException, NotFoundException } from '@nestjs/common';
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
    service = new SkillPackageQueryService(packageRepo, versionRepo, permissionQuery);
  });

  // ---- list ----
  describe('list — active-only filter + sort + limit cap', () => {
    it('emits active-only WHERE and id DESC sort; limit capped at 100', async () => {
      const qb = makeQueryBuilder();
      packageRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

      await service.list({ page: 1, limit: 200, search: undefined });

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

    it('search filter is parameter-bound (not string-concatenated)', async () => {
      const qb = makeQueryBuilder();
      packageRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

      await service.list({ page: 1, limit: 10, search: 'hello world' });

      const joined = qb.capturedWheres.join(' | ');
      expect(joined).toContain('ILIKE :search');
      // Must NOT have raw "hello world" concatenated — param object must hold it.
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

      const result = await service.list({ page: 1, limit: 10 });

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

      const result = await service.list({ page: 1, limit: 10 });

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

    it('returns hasPendingVersion=true when a pending version exists', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue({
        id: 1,
        status: SkillPackageStatus.ACTIVE,
        created_by: USER_ID,
        active_version: { id: 10, files: [] },
      });
      versionRepo.find = jest.fn().mockResolvedValue([
        { id: 11, version_no: 2, state: SkillVersionState.PENDING, files: [] },
        { id: 10, version_no: 1, state: SkillVersionState.APPROVED, files: [] },
      ]);
      permissionQuery.getUserPermissions.mockResolvedValue(['skill_upload']);

      const result = await service.detail(1, USER_ID);
      expect(result.hasPendingVersion).toBe(true);
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
      category: 'util',
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
      packageRepo.findOne = jest.fn().mockResolvedValue({ id: PACKAGE_ID, active_version_id: ACTIVE_VID });

      const result = await service.getDiff(VERSION_ID, USER_ID);
      expect(result.base).toBe('# base');
      expect(result.incoming).toBe('# incoming');
      expect(result.metadata).toMatchObject({ version_id: VERSION_ID, version_no: 2, name: 'v2' });
    });
  });

  // ---- listMyItems — owner-scoped, bucketed by latest-version state, SQL-paginated ----
  describe('listMyItems — status bucket on latest version + SQL pagination', () => {
    // Helper: stub the two manager.query round-trips (1: bucket rows, 2: file rows) and expose the
    // mock so tests can assert the emitted SQL / bound params of the bucket query.
    function stubQueries(bucketRows: any[], fileRows: any[] = []) {
      const query = jest.fn().mockResolvedValueOnce(bucketRows).mockResolvedValueOnce(fileRows);
      versionRepo.manager = { query };
      return query;
    }

    // A latest-version row as returned by the WITH…DISTINCT ON query (includes joined pkg fields
    // and the COUNT(*) OVER() page total). Overridable per test.
    function row(over: Record<string, unknown> = {}) {
      return {
        id: 10,
        skill_package_id: 1,
        version_no: 1,
        state: SkillVersionState.APPROVED,
        name: 'v1',
        short_description: 'desc',
        category: 'util',
        tags: [],
        avatar_url: null,
        created_at: new Date(),
        updated_at: new Date(),
        pkg_status: SkillPackageStatus.ACTIVE,
        active_version_id: 10,
        created_by: USER_ID,
        total_count: '1',
        ...over,
      };
    }

    it('scopes to the caller ($1=userId) and binds the status bucket as $2', async () => {
      const query = stubQueries([row({ state: SkillVersionState.PENDING })]);

      await service.listMyItems({ page: 1, limit: 20, status: SkillVersionState.PENDING }, USER_ID);

      const [sql, params] = query.mock.calls[0];
      expect(sql).toContain('DISTINCT ON (v.skill_package_id)');
      expect(sql).toContain('p.created_by = $1');
      expect(sql).toContain('WHERE state = $2');
      expect(params[0]).toBe(USER_ID);
      expect(params[1]).toBe(SkillVersionState.PENDING);
    });

    it('paginates in SQL: LIMIT/OFFSET params derived from page/limit; total from COUNT(*) OVER()', async () => {
      const query = stubQueries([row({ total_count: '7' })]);

      const result = await service.listMyItems({ page: 3, limit: 10, status: SkillVersionState.APPROVED }, USER_ID);

      const params = query.mock.calls[0][1];
      // Last two bound params are limit then offset ((page-1)*limit = 20).
      expect(params[params.length - 2]).toBe(10);
      expect(params[params.length - 1]).toBe(20);
      expect(result.meta).toEqual({ total: 7, page: 3, limit: 10 });
    });

    it('returns {data, meta:{total, page, limit}} mapped from bucket rows', async () => {
      stubQueries([row()]);

      const result = await service.listMyItems({ page: 1, limit: 20, status: SkillVersionState.APPROVED }, USER_ID);

      expect(result).toMatchObject({ data: expect.any(Array), meta: { total: 1, page: 1, limit: 20 } });
      const item = result.data[0];
      expect(item.id).toBe(1);
      expect(item.status).toBe(SkillPackageStatus.ACTIVE);
      expect(item.latest_state).toBe(SkillVersionState.APPROVED);
      expect(item.version.state).toBe(SkillVersionState.APPROVED);
    });

    it('rejected bucket surfaces the latest (rejected) version, not active_version_id', async () => {
      // active_version_id still points at the old approved v1, but the latest row is a rejected v2.
      stubQueries([
        row({ id: 22, version_no: 2, state: SkillVersionState.REJECTED, name: 'v2-reject', active_version_id: 10 }),
      ]);

      const result = await service.listMyItems({ page: 1, limit: 20, status: SkillVersionState.REJECTED }, USER_ID);

      expect(result.data[0].version.name).toBe('v2-reject');
      expect(result.data[0].version.version_no).toBe(2);
      expect(result.data[0].latest_state).toBe(SkillVersionState.REJECTED);
    });

    it('appends a bound search fragment; keyword lowercased + wrapped in wildcards', async () => {
      const query = stubQueries([row({ name: 'API Skill', short_description: 'api stuff' })]);

      await service.listMyItems({ page: 1, limit: 20, status: SkillVersionState.APPROVED, search: 'API' }, USER_ID);

      const [sql, params] = query.mock.calls[0];
      expect(sql).toContain('lower(name) LIKE');
      expect(sql).toContain('lower(short_description) LIKE');
      expect(params).toContain('%api%');
    });

    it('appends a bound category fragment (lowercased equality)', async () => {
      const query = stubQueries([row({ category: 'data' })]);

      await service.listMyItems(
        { page: 1, limit: 20, status: SkillVersionState.APPROVED, category: 'Data' as any },
        USER_ID,
      );

      const [sql, params] = query.mock.calls[0];
      expect(sql).toContain('lower(category) = ');
      expect(params).toContain('data');
    });

    it('version projection omits skill_md_content and reject_reason', async () => {
      stubQueries([row()]);

      const result = await service.listMyItems({ page: 1, limit: 20, status: SkillVersionState.APPROVED }, USER_ID);

      const version = result.data[0].version as any;
      expect(version.skill_md_content).toBeUndefined();
      expect(version.reject_reason).toBeUndefined();
    });

    it('folds the representative zip into a single `file` object', async () => {
      stubQueries(
        [row()],
        [
          {
            skill_version_id: 10,
            file_kind: 'zip',
            file_url: '/uploads/v1.zip',
            name: 'v1.zip',
            size: 1024,
            mime_type: 'application/zip',
          },
        ],
      );

      const result = await service.listMyItems({ page: 1, limit: 20, status: SkillVersionState.APPROVED }, USER_ID);

      expect(result.data[0].version.file?.file_url).toBe('/uploads/v1.zip');
    });

    it('file=null when the representative has no zip row', async () => {
      stubQueries([row()], []);

      const result = await service.listMyItems({ page: 1, limit: 20, status: SkillVersionState.APPROVED }, USER_ID);

      expect(result.data[0].version.file).toBeNull();
    });

    it('returns empty data and total=0 (and skips the file query) when the bucket is empty', async () => {
      const query = stubQueries([], []);

      const result = await service.listMyItems({ page: 1, limit: 20, status: SkillVersionState.PENDING }, USER_ID);

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
      // No representatives → no second (file-loading) round-trip.
      expect(query).toHaveBeenCalledTimes(1);
    });
  });
});
