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
    service = new SkillPackageQueryService(packageRepo, versionRepo, permissionQuery);
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

  it('404 for an inactive package to a non-owner / non-approver', async () => {
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

  it('approver may download an inactive package', async () => {
    permissionQuery.getUserPermissions.mockResolvedValue(['skill_approve']);
    packageRepo.findOne.mockResolvedValue(makePackage({ status: SkillPackageStatus.INACTIVE }));
    const res = await service.resolveActiveZip(PACKAGE_ID, OTHER_ID);
    expect(res.name).toBe('My Skill');
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
