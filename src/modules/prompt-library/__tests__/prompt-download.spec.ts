import { NotFoundException } from '@nestjs/common';
import { PromptLibraryQueryService } from '../prompt-library-query.service';
import { PromptPackageStatus } from '@modules/databases/prompt-package.entity';

const OWNER_ID = 10;
const OTHER_ID = 20;
const PACKAGE_ID = 1;

function makePackage(overrides: any = {}) {
  return {
    id: PACKAGE_ID,
    status: PromptPackageStatus.ACTIVE,
    created_by: OWNER_ID,
    active_version_id: 99,
    active_version: {
      version_no: 2,
      name: 'Prompt A',
      submitted_by: 42,
      prompt_content: 'do the thing',
    },
    ...overrides,
  };
}

describe('PromptLibraryQueryService.resolveActiveForExport', () => {
  let service: PromptLibraryQueryService;
  let packageRepo: any;
  let versionRepo: any;
  let permissionQuery: any;

  beforeEach(() => {
    jest.clearAllMocks();
    permissionQuery = { getUserPermissions: jest.fn().mockResolvedValue([]) };
    packageRepo = { findOne: jest.fn() };
    // manager.query backs resolveEmails (SELECT id,email FROM users).
    versionRepo = {
      manager: { query: jest.fn().mockResolvedValue([{ id: 42, email: 'author@example.com' }]) },
    };
    service = new PromptLibraryQueryService(packageRepo, versionRepo, permissionQuery);
  });

  it('returns the active version + resolved author email for an active package', async () => {
    packageRepo.findOne.mockResolvedValue(makePackage());
    const res = await service.resolveActiveForExport(PACKAGE_ID, OTHER_ID);
    expect(res.version.name).toBe('Prompt A');
    expect(res.authorEmail).toBe('author@example.com');
  });

  it('authorEmail is null when the users lookup returns nothing', async () => {
    versionRepo.manager.query.mockResolvedValue([]);
    packageRepo.findOne.mockResolvedValue(makePackage());
    const res = await service.resolveActiveForExport(PACKAGE_ID, OWNER_ID);
    expect(res.authorEmail).toBeNull();
  });

  it('404 when the package is missing', async () => {
    packageRepo.findOne.mockResolvedValue(null);
    await expect(service.resolveActiveForExport(PACKAGE_ID, OWNER_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('404 for an inactive package to a non-owner / non-approver', async () => {
    packageRepo.findOne.mockResolvedValue(makePackage({ status: PromptPackageStatus.INACTIVE }));
    await expect(service.resolveActiveForExport(PACKAGE_ID, OTHER_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('owner may export an inactive package', async () => {
    packageRepo.findOne.mockResolvedValue(makePackage({ status: PromptPackageStatus.INACTIVE }));
    const res = await service.resolveActiveForExport(PACKAGE_ID, OWNER_ID);
    expect(res.version.version_no).toBe(2);
  });

  it('approver may export an inactive package', async () => {
    permissionQuery.getUserPermissions.mockResolvedValue(['prompt_approve']);
    packageRepo.findOne.mockResolvedValue(makePackage({ status: PromptPackageStatus.INACTIVE }));
    const res = await service.resolveActiveForExport(PACKAGE_ID, OTHER_ID);
    expect(res.version.name).toBe('Prompt A');
  });

  it('404 when the package has no active version', async () => {
    packageRepo.findOne.mockResolvedValue(
      makePackage({ active_version_id: null, active_version: null }),
    );
    await expect(service.resolveActiveForExport(PACKAGE_ID, OWNER_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('404 when the active version itself is soft-deleted (is_deleted true)', async () => {
    packageRepo.findOne.mockResolvedValue(
      makePackage({
        active_version: {
          version_no: 2,
          name: 'Prompt A',
          submitted_by: 42,
          prompt_content: 'do the thing',
          is_deleted: true,
        },
      }),
    );
    await expect(service.resolveActiveForExport(PACKAGE_ID, OWNER_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
