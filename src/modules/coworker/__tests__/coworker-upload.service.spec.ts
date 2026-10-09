/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/require-await */
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { CoworkerUploadService } from '../coworker-upload.service';
import { CoworkerVersionState } from '@modules/databases/coworker-version.entity';
import { CoworkerPackageStatus } from '@modules/databases/coworker-package.entity';

const USER_ID = 100;
const OTHER_USER_ID = 200;
const PACKAGE_ID = 1;
const VERSION_ID = 5;

const META = {
  publisher_id: 7,
  responsible_user_ids: [11],
  kind: 'personal',
  channel_ids: [1],
  model_id: 2,
  link: 'https://teams.microsoft.com/l/meetup-join/x',
};

function makeItemMeta() {
  return {
    assertPublisher: jest.fn().mockResolvedValue(undefined),
    assertUsers: jest.fn(async (_m: unknown, ids: number[]) => ids),
    replaceResponsibles: jest.fn().mockResolvedValue(undefined),
    listSupporterIds: jest.fn().mockResolvedValue([]),
    assertSupporterUsers: jest.fn(async (_m: unknown, ids: number[]) => ids),
    replaceSupporters: jest.fn().mockResolvedValue(undefined),
  };
}

function lookupManager(saved: any[] = [], updates: any[] = []) {
  return {
    create: jest.fn((_E: any, data: any) => ({ ...data })),
    save: jest.fn(async (_E: any, obj: any) => {
      const row = { ...obj, id: saved.length + 1 };
      saved.push({ entity: _E?.name, row });
      return row;
    }),
    update: jest.fn(async (_E: any, id: any, patch: any) => {
      updates.push({ entity: _E?.name, id, patch });
    }),
    delete: jest.fn(),
    query: jest.fn().mockImplementation(async (sql: string) => {
      if (sql.includes('ai_hub_coworker_channels')) return [{ id: 1 }];
      if (sql.includes('ai_hub_coworker_models')) return [{ id: 2 }];
      if (sql.includes('MAX(version_no)')) return [{ max: '1' }];
      return [];
    }),
    findOne: jest.fn(),
  };
}

describe('CoworkerUploadService', () => {
  let service: CoworkerUploadService;
  let packageRepo: any;
  let versionRepo: any;
  let dataSource: any;
  let avatarUrl: any;
  let permissionQuery: any;
  let itemMeta: any;

  beforeEach(() => {
    jest.clearAllMocks();
    packageRepo = { findOne: jest.fn(), save: jest.fn(async (x: any) => x) };
    versionRepo = { findOne: jest.fn().mockResolvedValue(null), save: jest.fn(async (x: any) => x) };
    dataSource = {
      manager: {},
      transaction: jest.fn(async (cb: any) => cb(lookupManager())),
    };
    avatarUrl = { assertStrapiUrl: jest.fn() };
    permissionQuery = { getUserPermissions: jest.fn().mockResolvedValue(['coworker_upload']) };
    itemMeta = makeItemMeta();
    service = new CoworkerUploadService(packageRepo, versionRepo, dataSource, avatarUrl, permissionQuery, itemMeta);
  });

  describe('createNew', () => {
    const dto = { ...META, code: 'CW-A', name: 'Bot', short_description: 'desc' };

    it('persists the user-provided code (not coworker_<id>)', async () => {
      const saved: any[] = [];
      dataSource.transaction = jest.fn(async (cb: any) => cb(lookupManager(saved)));
      service = new CoworkerUploadService(packageRepo, versionRepo, dataSource, avatarUrl, permissionQuery, itemMeta);
      await service.createNew(dto as any, USER_ID);
      const pkg = saved.find((s) => s.entity === 'CoworkerPackage')?.row;
      expect(pkg.code).toBe('CW-A');
      expect(pkg.code).not.toMatch(/^coworker_/);
    });

    it('maps unique-code 23505 to ConflictException 409', async () => {
      const pgError = new QueryFailedError('INSERT', [], new Error('dup'));
      (pgError as any).code = '23505';
      dataSource.transaction = jest.fn().mockRejectedValue(pgError);
      await expect(service.createNew(dto as any, USER_ID)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('createVersion', () => {
    const dto = { ...META, name: 'v2', short_description: 'desc', changelog_note: 'bump' };

    it('stranger with upload → ForbiddenException', async () => {
      packageRepo.findOne.mockResolvedValue({ id: PACKAGE_ID, is_deleted: false, created_by: OTHER_USER_ID });
      await expect(service.createVersion(PACKAGE_ID, dto as any, USER_ID)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('approver without create/support → ForbiddenException', async () => {
      packageRepo.findOne.mockResolvedValue({ id: PACKAGE_ID, is_deleted: false, created_by: OTHER_USER_ID });
      permissionQuery.getUserPermissions.mockResolvedValue(['coworker_approve']);
      await expect(service.createVersion(PACKAGE_ID, dto as any, USER_ID)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('supporter with coworker_upload → allowed', async () => {
      packageRepo.findOne.mockResolvedValue({ id: PACKAGE_ID, is_deleted: false, created_by: OTHER_USER_ID });
      itemMeta.listSupporterIds.mockResolvedValue([USER_ID]);
      const saved: any[] = [];
      dataSource.transaction = jest.fn(async (cb: any) => cb(lookupManager(saved)));
      service = new CoworkerUploadService(packageRepo, versionRepo, dataSource, avatarUrl, permissionQuery, itemMeta);
      const result = await service.createVersion(PACKAGE_ID, dto as any, USER_ID);
      expect(result.version).toBeDefined();
    });
  });

  describe('editVersion — pending is SO-only', () => {
    const dto = { ...META, name: 'fix', short_description: 'desc', changelog_note: 'edit' };

    it('approver cannot edit pending', async () => {
      versionRepo.findOne.mockResolvedValue({
        id: VERSION_ID,
        coworker_package_id: PACKAGE_ID,
        state: CoworkerVersionState.PENDING,
        submitted_by: OTHER_USER_ID,
      });
      packageRepo.findOne.mockResolvedValue({ id: PACKAGE_ID, is_deleted: false, created_by: OTHER_USER_ID });
      permissionQuery.getUserPermissions.mockResolvedValue(['coworker_approve']);
      await expect(service.editVersion(VERSION_ID, dto as any, USER_ID)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('workspace SO can edit pending', async () => {
      versionRepo.findOne.mockResolvedValue({
        id: VERSION_ID,
        coworker_package_id: PACKAGE_ID,
        state: CoworkerVersionState.PENDING,
        submitted_by: OTHER_USER_ID,
      });
      packageRepo.findOne.mockResolvedValue({ id: PACKAGE_ID, is_deleted: false, created_by: OTHER_USER_ID });
      const ownerScope = {
        getUserOwnerScope: jest.fn().mockResolvedValue([{ rootTable: 'coworker_packages', rootId: 0 }]),
      };
      const locked = {
        id: VERSION_ID,
        coworker_package_id: PACKAGE_ID,
        state: CoworkerVersionState.PENDING,
        version_no: 1,
      };
      dataSource.transaction = jest.fn(async (cb: any) => {
        const manager = lookupManager();
        manager.findOne = jest.fn().mockResolvedValue(locked);
        return cb(manager);
      });
      service = new CoworkerUploadService(
        packageRepo,
        versionRepo,
        dataSource,
        avatarUrl,
        permissionQuery,
        itemMeta,
        ownerScope as never,
      );
      const result = await service.editVersion(VERSION_ID, dto as any, USER_ID);
      expect(result.version).toEqual({ id: VERSION_ID, version_no: 1 });
    });
  });

  describe('approve / reject / toggle', () => {
    it('approve pending sets active_version_id', async () => {
      const version = {
        id: VERSION_ID,
        coworker_package_id: PACKAGE_ID,
        state: CoworkerVersionState.PENDING,
        old_version: null,
      };
      const pkg = { id: PACKAGE_ID, active_version_id: null, status: CoworkerPackageStatus.ACTIVE };
      let savedPkg: any;
      dataSource.transaction = jest.fn(async (cb: any) => {
        const manager = {
          findOne: jest.fn().mockImplementation(async (_E: any, { where }: any) => {
            if (where.id === VERSION_ID) return { ...version };
            if (where.id === PACKAGE_ID) return { ...pkg };
            return null;
          }),
          save: jest.fn(async (_E: any, obj: any) => {
            if (obj.active_version_id !== undefined) savedPkg = obj;
            return obj;
          }),
        };
        return cb(manager);
      });
      await service.approve(VERSION_ID, USER_ID);
      expect(savedPkg?.active_version_id).toBe(VERSION_ID);
    });

    it('reject of non-pending → ForbiddenException', async () => {
      versionRepo.findOne.mockResolvedValue({ id: VERSION_ID, state: CoworkerVersionState.APPROVED });
      await expect(service.reject(VERSION_ID, { reason: 'x' }, USER_ID)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('package not found on toggle → NotFoundException', async () => {
      packageRepo.findOne.mockResolvedValue(null);
      await expect(
        service.toggleStatus(999, { status: CoworkerPackageStatus.INACTIVE } as any, USER_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
