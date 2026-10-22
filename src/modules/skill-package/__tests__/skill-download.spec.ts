import { NotFoundException } from '@nestjs/common';
import { SkillPackageQueryService } from '../skill-package-query.service';
import { SkillPackageStatus } from '@modules/databases/skill-package.entity';
import { SkillVersionFileKind } from '@modules/databases/skill-version-file.entity';

const OWNER_ID = 10;
const OTHER_ID = 20;
const PACKAGE_ID = 1;

// Build a package row with an active version + optional zip file rows.
function makePackage(overrides: any = {}) {
  const zip = {
    file_kind: SkillVersionFileKind.ZIP,
    file_url: '/uploads/skill-abc.zip',
    is_deleted: false,
  };
  return {
    id: PACKAGE_ID,
    status: SkillPackageStatus.ACTIVE,
    created_by: OWNER_ID,
    active_version_id: 99,
    active_version: {
      version_no: 4,
      name: 'My Skill',
      files: [zip],
    },
    ...overrides,
  };
}

describe('SkillPackageQueryService.resolveActiveZip', () => {
  let service: SkillPackageQueryService;
  let packageRepo: any;
  let versionRepo: any;
  let permissionQuery: any;

  beforeEach(() => {
    jest.clearAllMocks();
    permissionQuery = { getUserPermissions: jest.fn().mockResolvedValue([]) };
    packageRepo = { findOne: jest.fn() };
    versionRepo = { manager: { query: jest.fn().mockResolvedValue([]) } };
    // Metadata batch loader — the download path does not decorate, so empty maps suffice.
    const metaRead = {
      getCoworkersByVersionIds: jest.fn().mockResolvedValue(new Map()),
      getResponsiblesByPackageIds: jest.fn().mockResolvedValue(new Map()),
      getPublishersByIds: jest.fn().mockResolvedValue(new Map()),
      getSupportersByPackageIds: jest.fn().mockResolvedValue(new Map()),
    };
    service = new SkillPackageQueryService(packageRepo, versionRepo, permissionQuery, metaRead as never);
  });

  it('returns the zip descriptor for an active package (any authenticated user)', async () => {
    packageRepo.findOne.mockResolvedValue(makePackage());
    const res = await service.resolveActiveZip(PACKAGE_ID, OTHER_ID);
    expect(res).toEqual({ fileUrl: '/uploads/skill-abc.zip', name: 'My Skill', versionNo: 4 });
  });

  it('404 when the package is missing', async () => {
    packageRepo.findOne.mockResolvedValue(null);
    await expect(service.resolveActiveZip(PACKAGE_ID, OWNER_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('404 for an inactive package to a non-owner / non-supporter / non-SO', async () => {
    packageRepo.findOne.mockResolvedValue(makePackage({ status: SkillPackageStatus.INACTIVE }));
    await expect(service.resolveActiveZip(PACKAGE_ID, OTHER_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('owner may download an inactive package', async () => {
    packageRepo.findOne.mockResolvedValue(makePackage({ status: SkillPackageStatus.INACTIVE }));
    const res = await service.resolveActiveZip(PACKAGE_ID, OWNER_ID);
    expect(res.versionNo).toBe(4);
  });

  it('approver without owner/support/SO cannot download an inactive package', async () => {
    permissionQuery.getUserPermissions.mockResolvedValue(['skill_approve']);
    packageRepo.findOne.mockResolvedValue(makePackage({ status: SkillPackageStatus.INACTIVE }));
    await expect(service.resolveActiveZip(PACKAGE_ID, OTHER_ID)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404 when the package has no active version', async () => {
    packageRepo.findOne.mockResolvedValue(
      makePackage({ active_version_id: null, active_version: null }),
    );
    await expect(service.resolveActiveZip(PACKAGE_ID, OWNER_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('404 when the active version itself is soft-deleted (is_deleted true)', async () => {
    packageRepo.findOne.mockResolvedValue(
      makePackage({
        active_version: {
          version_no: 4,
          name: 'My Skill',
          is_deleted: true,
          files: [{ file_kind: SkillVersionFileKind.ZIP, file_url: '/x.zip', is_deleted: false }],
        },
      }),
    );
    await expect(service.resolveActiveZip(PACKAGE_ID, OWNER_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('404 when the active version has no zip file row', async () => {
    packageRepo.findOne.mockResolvedValue(
      makePackage({ active_version: { version_no: 4, name: 'My Skill', files: [] } }),
    );
    await expect(service.resolveActiveZip(PACKAGE_ID, OWNER_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('404 when the only zip row is soft-deleted (is_deleted filtered in-memory)', async () => {
    packageRepo.findOne.mockResolvedValue(
      makePackage({
        active_version: {
          version_no: 4,
          name: 'My Skill',
          files: [{ file_kind: SkillVersionFileKind.ZIP, file_url: '/x.zip', is_deleted: true }],
        },
      }),
    );
    await expect(service.resolveActiveZip(PACKAGE_ID, OWNER_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('SkillPackageQueryService.resolvePendingVersionZip', () => {
  const VERSION_ID = 55;
  const zip = { file_kind: SkillVersionFileKind.ZIP, file_url: '/uploads/pending.zip', is_deleted: false };
  let service: SkillPackageQueryService;
  let packageRepo: any;
  let versionRepo: any;

  function pendingVersion(overrides: any = {}) {
    return { id: VERSION_ID, skill_package_id: PACKAGE_ID, name: 'My Skill', version_no: 4, old_version: 4, files: [zip], ...overrides };
  }

  beforeEach(() => {
    packageRepo = { findOne: jest.fn().mockResolvedValue({ id: PACKAGE_ID }) };
    versionRepo = { findOne: jest.fn(), manager: { query: jest.fn().mockResolvedValue([]) } };
    service = new SkillPackageQueryService(packageRepo, versionRepo, {} as never, {} as never);
  });

  it('returns the pending zip with the number it will get on approval', async () => {
    versionRepo.findOne.mockResolvedValue(pendingVersion());
    await expect(service.resolvePendingVersionZip(VERSION_ID)).resolves.toEqual({
      fileUrl: '/uploads/pending.zip',
      name: 'My Skill',
      versionNo: 5,
    });
    expect(versionRepo.findOne).toHaveBeenCalledWith({
      where: { id: VERSION_ID, is_deleted: false, state: 'pending' },
      relations: ['files'],
    });
  });

  it('first-ever pending version (old_version null) is numbered 1', async () => {
    versionRepo.findOne.mockResolvedValue(pendingVersion({ old_version: null, version_no: 1 }));
    expect((await service.resolvePendingVersionZip(VERSION_ID)).versionNo).toBe(1);
  });

  it('404 when the id is not a live pending version', async () => {
    versionRepo.findOne.mockResolvedValue(null);
    await expect(service.resolvePendingVersionZip(VERSION_ID)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404 when the package is deleted', async () => {
    versionRepo.findOne.mockResolvedValue(pendingVersion());
    packageRepo.findOne.mockResolvedValue(null);
    await expect(service.resolvePendingVersionZip(VERSION_ID)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404 when the pending version has no live zip', async () => {
    versionRepo.findOne.mockResolvedValue(pendingVersion({ files: [{ ...zip, is_deleted: true }] }));
    await expect(service.resolvePendingVersionZip(VERSION_ID)).rejects.toBeInstanceOf(NotFoundException);
  });
});
