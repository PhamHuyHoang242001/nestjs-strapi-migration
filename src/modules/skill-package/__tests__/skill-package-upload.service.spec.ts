import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { SkillPackageUploadService } from '../skill-package-upload.service';
import { SkillVersionState } from '@modules/databases/skill-version.entity';
import { SkillPackageStatus } from '@modules/databases/skill-package.entity';

// We mock extractSkillZip so zip-parsing is not exercised in these unit tests.
jest.mock('../skill-zip.util', () => ({
  extractSkillZip: jest.fn().mockReturnValue({
    skillMd: '# mock skill.md',
    zipTree: [{ path: 'skill.md', isDir: false, size: 16 }],
  }),
}));

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
  kind: 'personal',
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

describe('SkillPackageUploadService', () => {
  let service: SkillPackageUploadService;
  let packageRepo: any;
  let versionRepo: any;
  let dataSource: any;
  let fileFetch: any;
  let permissionQuery: any;
  let itemMeta: any;

  const fakeZipFile = {
    buffer: Buffer.from('zip'),
    mimeType: 'application/zip',
    size: 1024,
    filename: 'hash.zip',
    originalName: 'hash.zip',
    path: 'http://strapi/uploads/skill.zip',
  };

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
    fileFetch = {
      downloadZip: jest.fn().mockResolvedValue(fakeZipFile),
      assertStrapiUrl: jest.fn(),
    };
    permissionQuery = { getUserPermissions: jest.fn() };
    itemMeta = makeItemMeta();

    service = new SkillPackageUploadService(packageRepo, versionRepo, dataSource, fileFetch, permissionQuery, itemMeta);
  });

  // ---- createNew — zip file row + inline avatar_url ----
  describe('createNew — persists a zip file row + inline avatar_url', () => {
    const dto = {
      file: { fileUrl: '/uploads/skill.zip', name: 'skill.zip' },
      avatar_url: '/uploads/avatar.png',
      name: 'My Skill',
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

    it('writes a zip file row (server-measured metadata) + stores avatar_url inline; no zip_url column; no Media', async () => {
      const saved: any[] = [];
      dataSource = captureDs(saved);
      service = new SkillPackageUploadService(packageRepo, versionRepo, dataSource, fileFetch, permissionQuery, itemMeta);

      await service.createNew(dto as any, USER_ID);

      const versionRow = saved.map((s) => s.row).find((r) => r.version_no === 1);
      // Avatar is inline on the version; zip moved to skill_version_files (no zip_url column).
      expect(versionRow.avatar_url).toBe('/uploads/avatar.png');
      expect(versionRow.zip_url).toBeUndefined();
      expect(versionRow.skill_md_content).toBe('# mock skill.md');
      expect(versionRow.zip_tree).toEqual([{ path: 'skill.md', isDir: false, size: 16 }]);

      const files = saved.filter((s) => s.entity === 'SkillVersionFile').map((s) => s.row);
      // Only the zip is a file row — the avatar is NOT modelled as a file row.
      expect(files).toHaveLength(1);
      expect(files[0]).toMatchObject({
        file_kind: 'zip',
        file_url: '/uploads/skill.zip',
        name: 'skill.zip', // client-provided file.name preferred (diagnostic-parity)
        size: 1024, // size/mime stay server-measured (authoritative)
        mime_type: 'application/zip',
      });

      // No Media entity is ever saved.
      expect(saved.some((s) => s.entity === 'Media')).toBe(false);
      // The zip is downloaded (via file.fileUrl) to extract skill.md; avatar origin is validated.
      expect(fileFetch.downloadZip).toHaveBeenCalledWith('/uploads/skill.zip');
      expect(fileFetch.assertStrapiUrl).toHaveBeenCalledWith('/uploads/avatar.png');
    });

    it('first version is old_version=null, version_no=1, and sets code=skill_<id> post-insert in the tx', async () => {
      const saved: any[] = [];
      const updates: any[] = [];
      dataSource = captureDs(saved, updates);
      service = new SkillPackageUploadService(packageRepo, versionRepo, dataSource, fileFetch, permissionQuery, itemMeta);

      await service.createNew(dto as any, USER_ID);

      const versionRow = saved.map((s) => s.row).find((r) => r.version_no === 1);
      expect(versionRow.old_version).toBeNull();
      expect(versionRow.state).toBe(SkillVersionState.PENDING);
      // code is set post-insert (id known only after the package save) in the SAME tx.
      const codeUpdate = updates.find((u) => u.entity === 'SkillPackage');
      expect(codeUpdate).toBeDefined();
      expect(codeUpdate.patch).toEqual({ code: 'skill_1' });
    });

    it('falls back to the server-parsed filename when file.name is omitted; still writes the zip row', async () => {
      const saved: any[] = [];
      dataSource = captureDs(saved);
      service = new SkillPackageUploadService(packageRepo, versionRepo, dataSource, fileFetch, permissionQuery, itemMeta);

      // No file.name provided → name falls back to the download's parsed filename ('hash.zip').
      await service.createNew(
        { ...dto, avatar_url: undefined, file: { fileUrl: '/uploads/skill.zip' } } as any,
        USER_ID,
      );

      const versionRow = saved.map((s) => s.row).find((r) => r.version_no === 1);
      expect(versionRow.avatar_url).toBeNull();

      const files = saved.filter((s) => s.entity === 'SkillVersionFile').map((s) => s.row);
      expect(files).toHaveLength(1);
      expect(files[0].file_kind).toBe('zip');
      expect(files[0].name).toBe('hash.zip'); // server-parsed fallback
      expect(fileFetch.assertStrapiUrl).not.toHaveBeenCalled();
    });
  });

  // ---- approve — single tx atomicity ----
  describe('approve — single tx sets active_version_id and version.state', () => {
    it('approve sets state=approved and package.active_version_id=vid in same tx', async () => {
      const version = { id: VERSION_ID, skill_package_id: PACKAGE_ID, state: SkillVersionState.PENDING };
      const pkg = { id: PACKAGE_ID, active_version_id: null, status: SkillPackageStatus.ACTIVE };

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

      // Version must be approved.
      expect(savedVersion?.state).toBe(SkillVersionState.APPROVED);
      expect(savedVersion?.reviewed_by).toBe(USER_ID);
      // Package must point to the approved version.
      expect(savedPkg?.active_version_id).toBe(VERSION_ID);
    });

    it('finalizes version_no=(old_version ?? 0)+1: update-pending old_version=1 → approved version_no=2', async () => {
      const version = {
        id: VERSION_ID,
        skill_package_id: PACKAGE_ID,
        state: SkillVersionState.PENDING,
        old_version: 1,
        version_no: 1, // placeholder shared with the live approved v1
      };
      const pkg = { id: PACKAGE_ID, active_version_id: 3, status: SkillPackageStatus.ACTIVE };
      let savedVersion: any;
      dataSource.transaction = jest.fn(async (cb: any) => {
        const manager = {
          findOne: jest.fn().mockImplementation(async (_E: any, { where }: any) => {
            if (where.id === VERSION_ID) return { ...version };
            if (where.id === PACKAGE_ID) return { ...pkg };
            return null;
          }),
          save: jest.fn(async (_E: any, obj: any) => {
            if (obj.version_no !== undefined && obj.state === SkillVersionState.APPROVED) savedVersion = obj;
            return { ...obj };
          }),
        };
        return cb(manager);
      });

      await service.approve(VERSION_ID, USER_ID);
      expect(savedVersion?.version_no).toBe(2);
      expect(savedVersion?.old_version).toBe(1); // predecessor preserved
    });

    it('first approve (old_version=null) → version_no=1', async () => {
      const version = { id: VERSION_ID, skill_package_id: PACKAGE_ID, state: SkillVersionState.PENDING, old_version: null, version_no: 1 };
      const pkg = { id: PACKAGE_ID, active_version_id: null, status: SkillPackageStatus.ACTIVE };
      let savedVersion: any;
      dataSource.transaction = jest.fn(async (cb: any) => {
        const manager = {
          findOne: jest.fn().mockImplementation(async (_E: any, { where }: any) => {
            if (where.id === VERSION_ID) return { ...version };
            if (where.id === PACKAGE_ID) return { ...pkg };
            return null;
          }),
          save: jest.fn(async (_E: any, obj: any) => {
            if (obj.version_no !== undefined && obj.state === SkillVersionState.APPROVED) savedVersion = obj;
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
          findOne: jest.fn().mockResolvedValue({ id: VERSION_ID, state: SkillVersionState.APPROVED }),
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
        state: SkillVersionState.PENDING,
        skill_package_id: PACKAGE_ID,
      });
      versionRepo.save = jest.fn(async (v: any) => v);

      await service.reject(VERSION_ID, { reason: 'needs revision' }, USER_ID);

      const saved = versionRepo.save.mock.calls[0][0];
      expect(saved.state).toBe(SkillVersionState.REJECTED);
      expect(saved.reject_reason).toBe('needs revision');
      expect(saved.reviewed_by).toBe(USER_ID);
    });

    it('reject of non-pending version → ForbiddenException', async () => {
      versionRepo.findOne = jest.fn().mockResolvedValue({
        id: VERSION_ID,
        state: SkillVersionState.APPROVED,
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
      file: { fileUrl: 'http://strapi/uploads/skill.zip', name: 'skill.zip' },
      name: 'v2',
      short_description: 'desc',
      category_id: 1,
      ...META_FIELDS,
    };

    it('sets old_version=latest approved, version_no=placeholder (=old_version) + zip file row in one tx', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue({ id: PACKAGE_ID, is_deleted: false, created_by: USER_ID });
      permissionQuery.getUserPermissions.mockResolvedValue(['skill_upload']);

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
      service = new SkillPackageUploadService(packageRepo, versionRepo, dataSource, fileFetch, permissionQuery, itemMeta);

      const dtoV2 = { ...dto, avatar_url: '/uploads/av.png', changelog_note: 'bump' };
      const result = await service.createVersion(PACKAGE_ID, dtoV2 as any, USER_ID);

      // Pending update: version_no is the placeholder sharing the live approved number (3); approve
      // later finalizes it to 4. old_version records the predecessor (3).
      expect(result.version.version_no).toBe(3);

      const versionRow = saved.find((s) => s.entity === 'SkillVersion')?.row;
      expect(versionRow).toMatchObject({
        skill_package_id: PACKAGE_ID,
        version_no: 3,
        old_version: 3,
        state: SkillVersionState.PENDING,
        submitted_by: USER_ID,
        changelog_note: 'bump',
        skill_md_content: '# mock skill.md',
        avatar_url: '/uploads/av.png', // avatar stored inline on the version
      });
      // No zip_url column — the zip is a file row.
      expect(versionRow.zip_url).toBeUndefined();

      const files = saved.filter((s) => s.entity === 'SkillVersionFile').map((s) => s.row);
      // Only the zip is a file row.
      expect(files).toHaveLength(1);
      expect(files[0]).toMatchObject({
        skill_version_id: 99,
        file_kind: 'zip',
        file_url: 'http://strapi/uploads/skill.zip',
        name: 'skill.zip', // client-provided file.name preferred
        size: 1024,
        mime_type: 'application/zip',
      });
      // Zip is downloaded (via file.fileUrl) to validate/extract skill.md; avatar origin is validated.
      expect(fileFetch.downloadZip).toHaveBeenCalledWith('http://strapi/uploads/skill.zip');
      expect(fileFetch.assertStrapiUrl).toHaveBeenCalledWith('/uploads/av.png');
    });

    it('catches PG 23505 unique-violation → ConflictException (409)', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue({ id: PACKAGE_ID, is_deleted: false, created_by: USER_ID });
      permissionQuery.getUserPermissions.mockResolvedValue(['skill_upload']);

      // Simulate PG unique-violation error from the partial-unique pending index.
      const pgError = new QueryFailedError('INSERT', [], new Error('dup key'));
      (pgError as any).code = '23505';
      dataSource.transaction = jest.fn().mockRejectedValue(pgError);

      await expect(service.createVersion(PACKAGE_ID, dto as any, USER_ID)).rejects.toBeInstanceOf(ConflictException);
    });

    it('existing pending version → ConflictException before ZIP I/O or transaction', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue({ id: PACKAGE_ID, is_deleted: false, created_by: USER_ID });
      permissionQuery.getUserPermissions.mockResolvedValue(['skill_upload']);
      versionRepo.findOne.mockResolvedValue({ id: VERSION_ID, state: SkillVersionState.PENDING });

      const request = service.createVersion(PACKAGE_ID, dto as any, USER_ID);
      await expect(request).rejects.toBeInstanceOf(ConflictException);
      await expect(request).rejects.toMatchObject({ status: 409 });

      expect(versionRepo.findOne).toHaveBeenCalledWith({
        where: {
          skill_package_id: PACKAGE_ID,
          state: SkillVersionState.PENDING,
          is_deleted: false,
        },
        select: { id: true },
      });
      expect(fileFetch.downloadZip).not.toHaveBeenCalled();
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('other DB errors are re-thrown unchanged', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue({ id: PACKAGE_ID, is_deleted: false, created_by: USER_ID });
      permissionQuery.getUserPermissions.mockResolvedValue(['skill_upload']);

      const pgError = new QueryFailedError('INSERT', [], new Error('connection lost'));
      (pgError as any).code = '57014'; // some other error
      dataSource.transaction = jest.fn().mockRejectedValue(pgError);

      await expect(service.createVersion(PACKAGE_ID, dto as any, USER_ID)).rejects.toBeInstanceOf(QueryFailedError);
    });

    it('package not found → NotFoundException', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue(null);

      await expect(service.createVersion(999, dto as any, USER_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('non-owner non-approver → ForbiddenException (guard before I/O)', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue({ id: PACKAGE_ID, is_deleted: false, created_by: OTHER_USER_ID });
      permissionQuery.getUserPermissions.mockResolvedValue(['skill_upload']); // no skill_approve

      await expect(service.createVersion(PACKAGE_ID, dto as any, USER_ID)).rejects.toBeInstanceOf(ForbiddenException);

      // Ownership guard runs BEFORE fileFetch.downloadZip (no I/O for unauthorized caller).
      expect(fileFetch.downloadZip).not.toHaveBeenCalled();
    });

    it('owner with skill_upload (no approve) → allowed', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue({ id: PACKAGE_ID, is_deleted: false, created_by: USER_ID });
      permissionQuery.getUserPermissions.mockResolvedValue(['skill_upload']);

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
      service = new SkillPackageUploadService(packageRepo, versionRepo, dataSource, fileFetch, permissionQuery, itemMeta);

      const result = await service.createVersion(PACKAGE_ID, dto as any, USER_ID);
      expect(result.version).toBeDefined();
      // latest approved = 1 → placeholder version_no = 1 (approve later → 2).
      expect(result.version.version_no).toBe(1);
    });

    it('non-owner with skill_approve (approver) → allowed', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue({ id: PACKAGE_ID, is_deleted: false, created_by: OTHER_USER_ID });
      permissionQuery.getUserPermissions.mockResolvedValue(['skill_approve']);

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
      service = new SkillPackageUploadService(packageRepo, versionRepo, dataSource, fileFetch, permissionQuery, itemMeta);

      const result = await service.createVersion(PACKAGE_ID, dto as any, USER_ID);
      expect(result.version).toBeDefined();
      // latest approved = 2 → placeholder version_no = 2 (approve later → 3).
      expect(result.version.version_no).toBe(2);
    });

    it('owner + approver → allowed (both conditions satisfied)', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue({ id: PACKAGE_ID, is_deleted: false, created_by: USER_ID });
      permissionQuery.getUserPermissions.mockResolvedValue(['skill_upload', 'skill_approve']);

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
      service = new SkillPackageUploadService(packageRepo, versionRepo, dataSource, fileFetch, permissionQuery, itemMeta);

      const result = await service.createVersion(PACKAGE_ID, dto as any, USER_ID);
      expect(result.version).toBeDefined();
      // latest approved = 1 → placeholder version_no = 1 (approve later → 2).
      expect(result.version.version_no).toBe(1);
    });

    it('no approved version yet (resubmit after reject): old_version=null, version_no falls back to 1', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue({ id: PACKAGE_ID, is_deleted: false, created_by: USER_ID });
      permissionQuery.getUserPermissions.mockResolvedValue(['skill_upload']);

      const saved: any[] = [];
      dataSource.transaction = jest.fn(async (cb: any) => {
        const manager = {
          // MAX(approved version_no) → NULL (nothing approved yet).
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
      service = new SkillPackageUploadService(packageRepo, versionRepo, dataSource, fileFetch, permissionQuery, itemMeta);

      const result = await service.createVersion(PACKAGE_ID, dto as any, USER_ID);
      expect(result.version.version_no).toBe(1);
      const versionRow = saved.find((s) => s.entity === 'SkillVersion')?.row;
      expect(versionRow.old_version).toBeNull();
      expect(versionRow.version_no).toBe(1);
    });
  });

  describe('editVersion — latest rejected only', () => {
    const dto = {
      file: { fileUrl: 'http://strapi/uploads/skill.zip', name: 'skill.zip' },
      name: 'v2-fixed',
      short_description: 'desc',
      category_id: 1,
      changelog_note: 'resubmit',
      ...META_FIELDS,
    };

    function stubLookups(opts?: { pending?: boolean; latestRejectedId?: number; state?: SkillVersionState }) {
      const state = opts?.state ?? SkillVersionState.REJECTED;
      versionRepo.findOne = jest.fn().mockImplementation(async ({ where }: any) => {
        if (where.id === VERSION_ID) {
          return { id: VERSION_ID, skill_package_id: PACKAGE_ID, state, version_no: 1, old_version: null };
        }
        if (where.state === SkillVersionState.PENDING) return opts?.pending ? { id: 88 } : null;
        if (where.state === SkillVersionState.REJECTED) {
          return { id: opts?.latestRejectedId ?? VERSION_ID };
        }
        return null;
      });
      packageRepo.findOne = jest.fn().mockResolvedValue({ id: PACKAGE_ID, is_deleted: false, created_by: USER_ID });
      permissionQuery.getUserPermissions.mockResolvedValue(['skill_upload']);
    }

    function captureEditTx() {
      const saved: any[] = [];
      dataSource.transaction = jest.fn(async (cb: any) => {
        const manager = {
          query: jest
            .fn()
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ id: VERSION_ID }]),
          findOne: jest.fn().mockResolvedValue({
            id: VERSION_ID,
            skill_package_id: PACKAGE_ID,
            state: SkillVersionState.REJECTED,
            version_no: 1,
            old_version: null,
          }),
          create: jest.fn((_E: any, data: any) => ({ ...data })),
          update: jest.fn(),
          save: jest.fn(async (_E: any, obj: any) => {
            saved.push(obj);
            return obj;
          }),
        };
        return cb(manager);
      });
      service = new SkillPackageUploadService(packageRepo, versionRepo, dataSource, fileFetch, permissionQuery, itemMeta);
      return saved;
    }

    it('resubmits latest rejected in place and returns to pending', async () => {
      stubLookups();
      const saved = captureEditTx();
      const result = await service.editVersion(VERSION_ID, dto as any, USER_ID);
      expect(result.version).toEqual({ id: VERSION_ID, version_no: 1 });
      const versionRow = saved.find((s) => s.state === SkillVersionState.PENDING);
      expect(versionRow.reject_reason).toBeNull();
      expect(versionRow.reviewed_by).toBeNull();
      expect(fileFetch.downloadZip).toHaveBeenCalled();
    });

    it('non-rejected version → ForbiddenException', async () => {
      stubLookups({ state: SkillVersionState.APPROVED });
      await expect(service.editVersion(VERSION_ID, dto as any, USER_ID)).rejects.toBeInstanceOf(ForbiddenException);
      expect(fileFetch.downloadZip).not.toHaveBeenCalled();
    });

    it('older rejected while a newer reject exists → ForbiddenException', async () => {
      stubLookups({ latestRejectedId: 99 });
      await expect(service.editVersion(VERSION_ID, dto as any, USER_ID)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('pending already exists → ConflictException', async () => {
      stubLookups({ pending: true });
      await expect(service.editVersion(VERSION_ID, dto as any, USER_ID)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  // ---- toggleStatus ----
  describe('toggleStatus — active/inactive visibility toggle', () => {
    it('updates the package status and returns {id, status}', async () => {
      const pkg: any = { id: PACKAGE_ID, status: SkillPackageStatus.ACTIVE, is_deleted: false };
      packageRepo.findOne = jest.fn().mockResolvedValue(pkg);
      packageRepo.save = jest.fn(async (p: any) => p);

      const result = await service.toggleStatus(PACKAGE_ID, { status: SkillPackageStatus.INACTIVE } as any);

      expect(packageRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: PACKAGE_ID, status: SkillPackageStatus.INACTIVE }),
      );
      expect(result).toEqual({ id: PACKAGE_ID, status: SkillPackageStatus.INACTIVE });
    });

    it('package not found → NotFoundException', async () => {
      packageRepo.findOne = jest.fn().mockResolvedValue(null);

      await expect(
        service.toggleStatus(999, { status: SkillPackageStatus.INACTIVE } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ---- getMyPermissions ----
  describe('getMyPermissions', () => {
    it('returns canUpload=true when skill_upload held', async () => {
      permissionQuery.getUserPermissions.mockResolvedValue(['skill_upload']);
      const result = await service.getMyPermissions(USER_ID);
      expect(result).toEqual({ canUpload: true, canApprove: false });
    });

    it('returns canApprove=true when skill_approve held', async () => {
      permissionQuery.getUserPermissions.mockResolvedValue(['skill_approve']);
      const result = await service.getMyPermissions(USER_ID);
      expect(result).toEqual({ canUpload: false, canApprove: true });
    });

    it('returns both false when no skill codes held', async () => {
      permissionQuery.getUserPermissions.mockResolvedValue(['some_other_code']);
      const result = await service.getMyPermissions(USER_ID);
      expect(result).toEqual({ canUpload: false, canApprove: false });
    });
  });
});
