import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { PromptLibraryUploadService } from '../prompt-library-upload.service';
import { PromptVersionState } from '@modules/databases/prompt-version.entity';
import { PromptPackageStatus } from '@modules/databases/prompt-package.entity';

const USER_ID = 100;
const OTHER_USER_ID = 200;
const PACKAGE_ID = 1;
const VERSION_ID = 5;
const PUBLISHER_ID = 7;
const PIC_IDS = [11, 12];
const TAG_IDS = [21, 22];

// Metadata every write now carries: publishing unit, people in charge, usage guide, catalog tags.
const META_FIELDS = {
  publisher_id: PUBLISHER_ID,
  responsible_user_ids: PIC_IDS,
  usage_guide_html: '<p>Hướng dẫn</p>',
  tag_ids: TAG_IDS,
};

// Stand-in for AssetHubItemMetaService: the asserts resolve by default (id validation is covered
// by that service's own spec) and the replace calls are recorded so the write order can be checked.
function makeItemMeta() {
  return {
    assertPublisher: jest.fn().mockResolvedValue(undefined),
    assertUsers: jest.fn(async (_m: unknown, ids: number[]) => ids),
    assertTags: jest.fn(async (_m: unknown, ids: number[]) => ids),
    replaceResponsibles: jest.fn().mockResolvedValue(undefined),
    replaceVersionTags: jest.fn().mockResolvedValue(undefined),
  };
}

function makeDs(txResult?: unknown) {
  const ds: any = {
    transaction: jest.fn(async (cb: (manager: any) => unknown) => {
      const manager: any = {
        create: jest.fn((Entity: any, data: any) => ({ ...data })),
        save: jest.fn(async (Entity: any, obj: any) => ({ ...obj, id: Math.floor(Math.random() * 1000) + 1 })),
        update: jest.fn(),
        findOne: jest.fn(),
        query: jest.fn().mockResolvedValue([{ max: '1' }]),
      };
      return txResult !== undefined ? txResult : cb(manager);
    }),
  };
  return ds;
}

describe('PromptLibraryUploadService', () => {
  let service: PromptLibraryUploadService;
  let packageRepo: any;
  let versionRepo: any;
  let dataSource: any;
  let avatarUrl: any;
  let permissionQuery: any;
  let itemMeta: any;

  beforeEach(() => {
    jest.clearAllMocks();

    packageRepo = {
      findOne: jest.fn(),
      save: jest.fn(async (x: any) => ({ ...x, id: PACKAGE_ID })),
    };
    versionRepo = {
      findOne: jest.fn(),
      save: jest.fn(async (x: any) => ({ ...x, id: VERSION_ID })),
    };
    dataSource = makeDs();
    avatarUrl = { assertStrapiUrl: jest.fn() };
    permissionQuery = { getUserPermissions: jest.fn() };
    itemMeta = makeItemMeta();

    service = new PromptLibraryUploadService(packageRepo, versionRepo, dataSource, avatarUrl, permissionQuery, itemMeta);
  });

  // ---- createNew — inline prompt_content + inline avatar_url, NO file rows ----
  describe('createNew — persists inline prompt_content + avatar_url; no file rows', () => {
    const dto = {
      prompt_content: 'Write a haiku about {topic}.',
      avatar_url: '/uploads/avatar.png',
      name: 'My Prompt',
      short_description: 'desc',
      category_id: 1,
      ...META_FIELDS,
    };

    function captureDs(saved: any[], updates: any[] = []) {
      return {
        transaction: jest.fn(async (cb: any) => {
          const manager = {
            create: jest.fn((_Entity: any, data: any) => ({ ...data })),
            save: jest.fn(async (_Entity: any, obj: any) => {
              const row = { ...obj, id: 1 };
              saved.push({ entity: _Entity?.name, row });
              return row;
            }),
            update: jest.fn(async (_Entity: any, id: any, patch: any) => {
              updates.push({ entity: _Entity?.name, id, patch });
            }),
          };
          return cb(manager);
        }),
      } as any;
    }

    it('first version is old_version=null, version_no=1, and sets code=prompt_<id> post-insert in the tx', async () => {
      const saved: any[] = [];
      const updates: any[] = [];
      dataSource = captureDs(saved, updates);
      service = new PromptLibraryUploadService(packageRepo, versionRepo, dataSource, avatarUrl, permissionQuery, itemMeta);

      await service.createNew(dto as any, USER_ID);

      const versionRow = saved.map((s) => s.row).find((r) => r.version_no === 1);
      expect(versionRow.old_version).toBeNull();
      expect(versionRow.state).toBe(PromptVersionState.PENDING);
      const codeUpdate = updates.find((u) => u.entity === 'PromptPackage');
      expect(codeUpdate).toBeDefined();
      expect(codeUpdate.patch).toEqual({ code: 'prompt_1' });
    });

    it('stores prompt_content + avatar_url inline on the v1 version; no file entity saved', async () => {
      const saved: any[] = [];
      dataSource = captureDs(saved);
      service = new PromptLibraryUploadService(packageRepo, versionRepo, dataSource, avatarUrl, permissionQuery, itemMeta);

      await service.createNew(dto as any, USER_ID);

      const versionRow = saved.map((s) => s.row).find((r) => r.version_no === 1);
      expect(versionRow.prompt_content).toBe('Write a haiku about {topic}.');
      expect(versionRow.avatar_url).toBe('/uploads/avatar.png');
      // No ZIP/file concept exists — nothing but PromptPackage + PromptVersion is saved.
      expect(saved.some((s) => s.entity === 'PromptVersionFile')).toBe(false);
      expect(saved.some((s) => s.entity === 'Media')).toBe(false);
      // Avatar origin is validated (SSRF guard) when provided.
      expect(avatarUrl.assertStrapiUrl).toHaveBeenCalledWith('/uploads/avatar.png');
    });

    it('avatar_url null and SSRF guard skipped when avatar omitted', async () => {
      const saved: any[] = [];
      dataSource = captureDs(saved);
      service = new PromptLibraryUploadService(packageRepo, versionRepo, dataSource, avatarUrl, permissionQuery, itemMeta);

      await service.createNew({ ...dto, avatar_url: undefined } as any, USER_ID);

      const versionRow = saved.map((s) => s.row).find((r) => r.version_no === 1);
      expect(versionRow.avatar_url).toBeNull();
      expect(versionRow.prompt_content).toBe('Write a haiku about {topic}.');
      expect(avatarUrl.assertStrapiUrl).not.toHaveBeenCalled();
    });
  });

  // ---- approve — single tx atomicity ----
  describe('approve — single tx sets active_version_id and version.state', () => {
    it('approve sets state=approved and package.active_version_id=vid in same tx', async () => {
      const version = { id: VERSION_ID, prompt_package_id: PACKAGE_ID, state: PromptVersionState.PENDING };
      const pkg = { id: PACKAGE_ID, active_version_id: null, status: PromptPackageStatus.ACTIVE };

      let savedVersion: any;
      let savedPkg: any;

      dataSource.transaction = jest.fn(async (cb: any) => {
        const manager = {
          findOne: jest.fn().mockImplementation(async (_Entity: any, { where }: any) => {
            if (where.id === VERSION_ID) return { ...version };
            if (where.id === PACKAGE_ID) return { ...pkg };
            return null;
          }),
          save: jest.fn(async (_Entity: any, obj: any) => {
            if (obj.state !== undefined) savedVersion = obj;
            if (obj.active_version_id !== undefined) savedPkg = obj;
            return { ...obj };
          }),
        };
        return cb(manager);
      });

      await service.approve(VERSION_ID, USER_ID);

      expect(savedVersion?.state).toBe(PromptVersionState.APPROVED);
      expect(savedVersion?.reviewed_by).toBe(USER_ID);
      expect(savedPkg?.active_version_id).toBe(VERSION_ID);
    });

    it('finalizes version_no=(old_version ?? 0)+1: update-pending old_version=1 → approved version_no=2', async () => {
      const version = {
        id: VERSION_ID,
        prompt_package_id: PACKAGE_ID,
        state: PromptVersionState.PENDING,
        old_version: 1,
        version_no: 1,
      };
      const pkg = { id: PACKAGE_ID, active_version_id: 3, status: PromptPackageStatus.ACTIVE };
      let savedVersion: any;
      dataSource.transaction = jest.fn(async (cb: any) => {
        const manager = {
          findOne: jest.fn().mockImplementation(async (_E: any, { where }: any) => {
            if (where.id === VERSION_ID) return { ...version };
            if (where.id === PACKAGE_ID) return { ...pkg };
            return null;
          }),
          save: jest.fn(async (_E: any, obj: any) => {
            if (obj.version_no !== undefined && obj.state === PromptVersionState.APPROVED) savedVersion = obj;
            return { ...obj };
          }),
        };
        return cb(manager);
      });

      await service.approve(VERSION_ID, USER_ID);
      expect(savedVersion?.version_no).toBe(2);
      expect(savedVersion?.old_version).toBe(1);
    });

    it('first approve (old_version=null) → version_no=1', async () => {
      const version = { id: VERSION_ID, prompt_package_id: PACKAGE_ID, state: PromptVersionState.PENDING, old_version: null, version_no: 1 };
      const pkg = { id: PACKAGE_ID, active_version_id: null, status: PromptPackageStatus.ACTIVE };
      let savedVersion: any;
      dataSource.transaction = jest.fn(async (cb: any) => {
        const manager = {
          findOne: jest.fn().mockImplementation(async (_E: any, { where }: any) => {
            if (where.id === VERSION_ID) return { ...version };
            if (where.id === PACKAGE_ID) return { ...pkg };
            return null;
          }),
          save: jest.fn(async (_E: any, obj: any) => {
            if (obj.version_no !== undefined && obj.state === PromptVersionState.APPROVED) savedVersion = obj;
            return { ...obj };
          }),
        };
        return cb(manager);
      });

      await service.approve(VERSION_ID, USER_ID);
      expect(savedVersion?.version_no).toBe(1);
    });

    it('duplicate approved version_no (PG 23505) → ConflictException (409)', async () => {
      const pgError = new QueryFailedError('UPDATE', [], new Error('dup key'));
      (pgError as any).code = '23505';
      dataSource.transaction = jest.fn().mockRejectedValue(pgError);

      await expect(service.approve(VERSION_ID, USER_ID)).rejects.toBeInstanceOf(ConflictException);
    });

    it('approve of non-pending version → ForbiddenException', async () => {
      dataSource.transaction = jest.fn(async (cb: any) => {
        const manager = {
          findOne: jest.fn().mockResolvedValue({ id: VERSION_ID, state: PromptVersionState.APPROVED }),
          save: jest.fn(),
        };
        return cb(manager);
      });

      await expect(service.approve(VERSION_ID, USER_ID)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('approve with missing version → NotFoundException', async () => {
      dataSource.transaction = jest.fn(async (cb: any) => {
        const manager = {
          findOne: jest.fn().mockResolvedValue(null),
          save: jest.fn(),
        };
        return cb(manager);
      });

      await expect(service.approve(VERSION_ID, USER_ID)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ---- reject — reason required ----
  describe('reject — reason is required', () => {
    it('reject with reason → state=rejected + reject_reason saved', async () => {
      versionRepo.findOne = jest.fn().mockResolvedValue({
        id: VERSION_ID,
        state: PromptVersionState.PENDING,
        prompt_package_id: PACKAGE_ID,
      });
      versionRepo.save = jest.fn(async (v: any) => v);

      await service.reject(VERSION_ID, { reason: 'needs revision' }, USER_ID);

      const saved = versionRepo.save.mock.calls[0][0];
      expect(saved.state).toBe(PromptVersionState.REJECTED);
      expect(saved.reject_reason).toBe('needs revision');
      expect(saved.reviewed_by).toBe(USER_ID);
    });

    it('reject of non-pending version → ForbiddenException', async () => {
      versionRepo.findOne = jest.fn().mockResolvedValue({
        id: VERSION_ID,
        state: PromptVersionState.APPROVED,
      });

      await expect(service.reject(VERSION_ID, { reason: 'x' }, USER_ID)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('version not found → NotFoundException', async () => {
      versionRepo.findOne = jest.fn().mockResolvedValue(null);

      await expect(service.reject(VERSION_ID, { reason: 'x' }, USER_ID)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ---- createVersion — success path + pending guard ----
  describe('createVersion — success path + pending guard', () => {
    const dto = {
      prompt_content: 'v2 prompt body',
      name: 'v2',
      short_description: 'desc',
      category_id: 1,
      ...META_FIELDS,
    };

    it('sets old_version=latest approved, version_no=placeholder (=old_version) inline in one tx', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue({ id: PACKAGE_ID, is_deleted: false, created_by: USER_ID });
      permissionQuery.getUserPermissions.mockResolvedValue(['prompt_upload']);

      const saved: any[] = [];
      dataSource.transaction = jest.fn(async (cb: any) => {
        const manager = {
          // First query = SELECT ... FOR UPDATE (result ignored); MAX(approved version_no) → 3.
          query: jest.fn().mockResolvedValue([{ max: '3' }]),
          create: jest.fn((_E: any, data: any) => ({ ...data })),
          update: jest.fn(),
          save: jest.fn(async (_E: any, obj: any) => {
            const row = { ...obj, id: 99 };
            saved.push({ entity: _E?.name, row });
            return row;
          }),
        };
        return cb(manager);
      });
      service = new PromptLibraryUploadService(packageRepo, versionRepo, dataSource, avatarUrl, permissionQuery, itemMeta);

      const dtoV2 = { ...dto, avatar_url: '/uploads/av.png', changelog_note: 'bump' };
      const result = await service.createVersion(PACKAGE_ID, dtoV2 as any, USER_ID);

      // Pending update: version_no is the placeholder sharing the live approved number (3); approve
      // later finalizes it to 4. old_version records the predecessor (3).
      expect(result.version.version_no).toBe(3);

      const versionRow = saved.find((s) => s.entity === 'PromptVersion')?.row;
      expect(versionRow).toMatchObject({
        prompt_package_id: PACKAGE_ID,
        version_no: 3,
        old_version: 3,
        state: PromptVersionState.PENDING,
        submitted_by: USER_ID,
        changelog_note: 'bump',
        prompt_content: 'v2 prompt body',
        avatar_url: '/uploads/av.png',
      });
      // No file rows exist for prompts.
      expect(saved.some((s) => s.entity === 'PromptVersionFile')).toBe(false);
      expect(avatarUrl.assertStrapiUrl).toHaveBeenCalledWith('/uploads/av.png');
    });

    it('catches PG 23505 unique-violation → ConflictException (409)', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue({ id: PACKAGE_ID, is_deleted: false, created_by: USER_ID });
      permissionQuery.getUserPermissions.mockResolvedValue(['prompt_upload']);

      // Simulate PG unique-violation error from the partial-unique pending index.
      const pgError = new QueryFailedError('INSERT', [], new Error('dup key'));
      (pgError as any).code = '23505';
      dataSource.transaction = jest.fn().mockRejectedValue(pgError);

      await expect(service.createVersion(PACKAGE_ID, dto as any, USER_ID)).rejects.toBeInstanceOf(ConflictException);
    });

    it('existing pending version → ConflictException before avatar validation or transaction', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue({ id: PACKAGE_ID, is_deleted: false, created_by: USER_ID });
      permissionQuery.getUserPermissions.mockResolvedValue(['prompt_upload']);
      versionRepo.findOne.mockResolvedValue({ id: VERSION_ID, state: PromptVersionState.PENDING });

      const request = service.createVersion(
        PACKAGE_ID,
        { ...dto, avatar_url: '/uploads/invalid.png' } as any,
        USER_ID,
      );
      await expect(request).rejects.toBeInstanceOf(ConflictException);
      await expect(request).rejects.toMatchObject({ status: 409 });

      expect(versionRepo.findOne).toHaveBeenCalledWith({
        where: {
          prompt_package_id: PACKAGE_ID,
          state: PromptVersionState.PENDING,
          is_deleted: false,
        },
        select: { id: true },
      });
      expect(avatarUrl.assertStrapiUrl).not.toHaveBeenCalled();
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('other DB errors are re-thrown unchanged', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue({ id: PACKAGE_ID, is_deleted: false, created_by: USER_ID });
      permissionQuery.getUserPermissions.mockResolvedValue(['prompt_upload']);

      const pgError = new QueryFailedError('INSERT', [], new Error('connection lost'));
      (pgError as any).code = '57014'; // some other error
      dataSource.transaction = jest.fn().mockRejectedValue(pgError);

      await expect(service.createVersion(PACKAGE_ID, dto as any, USER_ID)).rejects.toBeInstanceOf(QueryFailedError);
    });

    it('package not found → NotFoundException', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue(null);

      await expect(service.createVersion(999, dto as any, USER_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('non-owner non-approver → ForbiddenException (guard before avatar validation)', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue({ id: PACKAGE_ID, is_deleted: false, created_by: OTHER_USER_ID });
      permissionQuery.getUserPermissions.mockResolvedValue(['prompt_upload']); // no prompt_approve

      await expect(
        service.createVersion(PACKAGE_ID, { ...dto, avatar_url: '/uploads/av.png' } as any, USER_ID),
      ).rejects.toBeInstanceOf(ForbiddenException);

      // Ownership guard runs BEFORE avatar SSRF validation.
      expect(avatarUrl.assertStrapiUrl).not.toHaveBeenCalled();
    });

    it('owner with prompt_upload (no approve) → allowed', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue({ id: PACKAGE_ID, is_deleted: false, created_by: USER_ID });
      permissionQuery.getUserPermissions.mockResolvedValue(['prompt_upload']);

      const saved: any[] = [];
      dataSource.transaction = jest.fn(async (cb: any) => {
        const manager = {
          query: jest.fn().mockResolvedValue([{ max: '1' }]),
          create: jest.fn((_E: any, data: any) => ({ ...data })),
          update: jest.fn(),
          save: jest.fn(async (_E: any, obj: any) => {
            saved.push({ entity: _E?.name, row: { ...obj, id: 99 } });
            return { ...obj, id: 99 };
          }),
        };
        return cb(manager);
      });
      service = new PromptLibraryUploadService(packageRepo, versionRepo, dataSource, avatarUrl, permissionQuery, itemMeta);

      const result = await service.createVersion(PACKAGE_ID, dto as any, USER_ID);
      expect(result.version).toBeDefined();
      // latest approved = 1 → placeholder version_no = 1 (approve later → 2).
      expect(result.version.version_no).toBe(1);
    });

    it('no approved version yet (resubmit after reject): old_version=null, version_no falls back to 1', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue({ id: PACKAGE_ID, is_deleted: false, created_by: USER_ID });
      permissionQuery.getUserPermissions.mockResolvedValue(['prompt_upload']);

      const saved: any[] = [];
      dataSource.transaction = jest.fn(async (cb: any) => {
        const manager = {
          query: jest.fn().mockResolvedValue([{ max: null }]),
          create: jest.fn((_E: any, data: any) => ({ ...data })),
          update: jest.fn(),
          save: jest.fn(async (_E: any, obj: any) => {
            saved.push({ entity: _E?.name, row: { ...obj, id: 99 } });
            return { ...obj, id: 99 };
          }),
        };
        return cb(manager);
      });
      service = new PromptLibraryUploadService(packageRepo, versionRepo, dataSource, avatarUrl, permissionQuery, itemMeta);

      const result = await service.createVersion(PACKAGE_ID, dto as any, USER_ID);
      expect(result.version.version_no).toBe(1);
      const versionRow = saved.find((s) => s.entity === 'PromptVersion')?.row;
      expect(versionRow.old_version).toBeNull();
      expect(versionRow.version_no).toBe(1);
    });

    it('non-owner with prompt_approve (approver) → allowed', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue({ id: PACKAGE_ID, is_deleted: false, created_by: OTHER_USER_ID });
      permissionQuery.getUserPermissions.mockResolvedValue(['prompt_approve']);

      const saved: any[] = [];
      dataSource.transaction = jest.fn(async (cb: any) => {
        const manager = {
          query: jest.fn().mockResolvedValue([{ max: '2' }]),
          create: jest.fn((_E: any, data: any) => ({ ...data })),
          update: jest.fn(),
          save: jest.fn(async (_E: any, obj: any) => {
            saved.push({ entity: _E?.name, row: { ...obj, id: 99 } });
            return { ...obj, id: 99 };
          }),
        };
        return cb(manager);
      });
      service = new PromptLibraryUploadService(packageRepo, versionRepo, dataSource, avatarUrl, permissionQuery, itemMeta);

      const result = await service.createVersion(PACKAGE_ID, dto as any, USER_ID);
      expect(result.version).toBeDefined();
      // latest approved = 2 → placeholder version_no = 2 (approve later → 3).
      expect(result.version.version_no).toBe(2);
    });

    it('owner + approver → allowed (both conditions satisfied)', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue({ id: PACKAGE_ID, is_deleted: false, created_by: USER_ID });
      permissionQuery.getUserPermissions.mockResolvedValue(['prompt_upload', 'prompt_approve']);

      const saved: any[] = [];
      dataSource.transaction = jest.fn(async (cb: any) => {
        const manager = {
          query: jest.fn().mockResolvedValue([{ max: '1' }]),
          create: jest.fn((_E: any, data: any) => ({ ...data })),
          update: jest.fn(),
          save: jest.fn(async (_E: any, obj: any) => {
            saved.push({ entity: _E?.name, row: { ...obj, id: 99 } });
            return { ...obj, id: 99 };
          }),
        };
        return cb(manager);
      });
      service = new PromptLibraryUploadService(packageRepo, versionRepo, dataSource, avatarUrl, permissionQuery, itemMeta);

      const result = await service.createVersion(PACKAGE_ID, dto as any, USER_ID);
      expect(result.version).toBeDefined();
      // latest approved = 1 → placeholder version_no = 1 (approve later → 2).
      expect(result.version.version_no).toBe(1);
    });
  });

  // ---- toggleStatus ----
  describe('toggleStatus — active/inactive visibility toggle', () => {
    it('updates the package status and returns {id, status}', async () => {
      const pkg: any = { id: PACKAGE_ID, status: PromptPackageStatus.ACTIVE, is_deleted: false };
      packageRepo.findOne = jest.fn().mockResolvedValue(pkg);
      packageRepo.save = jest.fn(async (p: any) => p);

      const result = await service.toggleStatus(PACKAGE_ID, { status: PromptPackageStatus.INACTIVE } as any);

      expect(packageRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: PACKAGE_ID, status: PromptPackageStatus.INACTIVE }),
      );
      expect(result).toEqual({ id: PACKAGE_ID, status: PromptPackageStatus.INACTIVE });
    });

    it('package not found → NotFoundException', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue(null);

      await expect(
        service.toggleStatus(999, { status: PromptPackageStatus.INACTIVE } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ---- getMyPermissions ----
  describe('getMyPermissions', () => {
    it('returns canUpload=true when prompt_upload held', async () => {
      permissionQuery.getUserPermissions.mockResolvedValue(['prompt_upload']);
      const result = await service.getMyPermissions(USER_ID);
      expect(result).toEqual({ canUpload: true, canApprove: false });
    });

    it('returns canApprove=true when prompt_approve held', async () => {
      permissionQuery.getUserPermissions.mockResolvedValue(['prompt_approve']);
      const result = await service.getMyPermissions(USER_ID);
      expect(result).toEqual({ canUpload: false, canApprove: true });
    });

    it('returns both false when no prompt codes held', async () => {
      permissionQuery.getUserPermissions.mockResolvedValue(['some_other_code']);
      const result = await service.getMyPermissions(USER_ID);
      expect(result).toEqual({ canUpload: false, canApprove: false });
    });
  });
});
