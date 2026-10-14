/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/require-await */
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { CoworkerUploadService } from '../coworker-upload.service';
import { CoworkerVersionState } from '@modules/databases/coworker-version.entity';
import { CoworkerPackageStatus } from '@modules/databases/coworker-package.entity';

const USER_ID = 100;
const OTHER_USER_ID = 200;
const PACKAGE_ID = 1;
const VERSION_ID = 5;

const TEAMS = 'https://teams.microsoft.com';
const TEAMS_LINK = `${TEAMS}/l/meetup-join/x`;

const META = {
  publisher_id: 7,
  responsible_user_ids: [11],
  kind: 'personal',
  channels: [{ channel_id: 1, link: TEAMS_LINK }],
  model_id: 2,
};

// Live channel rows the lookup query returns: id, name and the configured domain list.
type ChannelRow = { id: number; name: string; domain: string | null; type?: string | null };
const DEFAULT_CHANNELS: ChannelRow[] = [{ id: 1, name: 'Microsoft Teams', domain: TEAMS }];

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

function lookupManager(saved: any[] = [], updates: any[] = [], channels: ChannelRow[] = DEFAULT_CHANNELS) {
  return {
    create: jest.fn((_E: any, data: any) => ({ ...data })),
    save: jest.fn(async (_E: any, obj: any) => {
      // save(entities[]) — the join-row batch written by replaceVersionChannels.
      if (Array.isArray(_E)) {
        saved.push({ entity: 'batch', rows: _E });
        return _E;
      }
      const row = { ...obj, id: saved.length + 1 };
      saved.push({ entity: _E?.name, row });
      return row;
    }),
    update: jest.fn(async (_E: any, id: any, patch: any) => {
      updates.push({ entity: _E?.name, id, patch });
    }),
    delete: jest.fn(),
    query: jest.fn().mockImplementation(async (sql: string, params?: any[]) => {
      if (sql.includes('ai_hub_coworker_channels')) {
        const ids: number[] = params?.[0] ?? [];
        return channels.filter((c) => ids.includes(c.id));
      }
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

    it('stores one link per channel on the join rows; the version row has no link', async () => {
      const saved: any[] = [];
      const channels: ChannelRow[] = [
        { id: 1, name: 'Microsoft Teams', domain: TEAMS },
        { id: 2, name: 'Zalo', domain: 'https://zalo.me' },
        { id: 3, name: 'Outlook', domain: '@vpbank.com.vn', type: 'suffix' },
      ];
      dataSource.transaction = jest.fn(async (cb: any) => cb(lookupManager(saved, [], channels)));
      service = new CoworkerUploadService(packageRepo, versionRepo, dataSource, avatarUrl, permissionQuery, itemMeta);
      const pairs = [
        { channel_id: 1, link: `${TEAMS}/l/a` },
        { channel_id: 2, link: 'https://zalo.me/g/b' },
        { channel_id: 3, link: 'team-bi@vpbank.com.vn' },
      ];

      await service.createNew({ ...dto, channels: pairs } as any, USER_ID);

      const version = saved.find((s) => s.entity === 'CoworkerVersion')?.row;
      expect(version).not.toHaveProperty('link');
      const batch = saved.find((s) => s.entity === 'batch')?.rows;
      expect(batch).toEqual(pairs.map((p) => ({ coworker_version_id: version.id, ...p })));
    });

    it('a channel may have no link: stored as NULL, even when the channel has no domain configured', async () => {
      const saved: any[] = [];
      const channels: ChannelRow[] = [...DEFAULT_CHANNELS, { id: 4, name: 'Zalo', domain: null }];
      dataSource.transaction = jest.fn(async (cb: any) => cb(lookupManager(saved, [], channels)));
      service = new CoworkerUploadService(packageRepo, versionRepo, dataSource, avatarUrl, permissionQuery, itemMeta);
      const pairs = [
        { channel_id: 1, link: `${TEAMS}/l/a` },
        { channel_id: 4, link: '  ' },
      ];

      await service.createNew({ ...dto, channels: pairs } as any, USER_ID);

      const version = saved.find((s) => s.entity === 'CoworkerVersion')?.row;
      const batch = saved.find((s) => s.entity === 'batch')?.rows;
      expect(batch).toEqual([
        { coworker_version_id: version.id, channel_id: 1, link: `${TEAMS}/l/a` },
        { coworker_version_id: version.id, channel_id: 4, link: null },
      ]);
    });

    it.each([
      ['unknown channel', [{ channel_id: 9, link: `${TEAMS}/l/a` }], 'INVALID_CHANNELS'],
      ['channel without domain', [{ channel_id: 4, link: `${TEAMS}/l/a` }], 'has no domain configured'],
      ['link origin not in channel domain', [{ channel_id: 1, link: 'https://zalo.me/g/b' }], 'does not match channel'],
      ['look-alike host', [{ channel_id: 1, link: 'https://teams.microsoft.com.evil.vn/x' }], 'does not match channel'],
      ['email outside the suffix domain', [{ channel_id: 5, link: 'a@gmail.com' }], 'does not match channel'],
    ])('rejects %s with 400 before writing', async (_label, pairs, message) => {
      const saved: any[] = [];
      const channels: ChannelRow[] = [
        ...DEFAULT_CHANNELS,
        { id: 4, name: 'Zalo', domain: null },
        { id: 5, name: 'Outlook', domain: '@vpbank.com.vn', type: 'suffix' },
      ];
      dataSource.transaction = jest.fn(async (cb: any) => cb(lookupManager(saved, [], channels)));
      service = new CoworkerUploadService(packageRepo, versionRepo, dataSource, avatarUrl, permissionQuery, itemMeta);

      const err = await service.createNew({ ...dto, channels: pairs } as any, USER_ID).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).message).toContain(message);
      expect(saved).toHaveLength(0);
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

    it('package supporter with coworker_upload may resubmit latest rejected', async () => {
      versionRepo.findOne = jest.fn().mockImplementation(async ({ where }: any) => {
        if (where.id === VERSION_ID) {
          return {
            id: VERSION_ID,
            coworker_package_id: PACKAGE_ID,
            state: CoworkerVersionState.REJECTED,
            version_no: 1,
            submitted_by: OTHER_USER_ID,
          };
        }
        if (where.state === CoworkerVersionState.PENDING) return null;
        if (where.coworker_package_id && !where.state && !where.id) {
          return { id: VERSION_ID, state: CoworkerVersionState.REJECTED };
        }
        return null;
      });
      packageRepo.findOne.mockResolvedValue({ id: PACKAGE_ID, is_deleted: false, created_by: OTHER_USER_ID });
      itemMeta.listSupporterIds.mockResolvedValue([USER_ID]);
      dataSource.transaction = jest.fn(async (cb: any) => {
        const manager = lookupManager();
        manager.query = jest.fn().mockImplementation(async (sql: string) => {
          if (sql.includes('ai_hub_coworker_channels')) return DEFAULT_CHANNELS;
          if (sql.includes('ai_hub_coworker_models')) return [{ id: 2 }];
          if (sql.includes("state = 'pending'")) return [];
          if (sql.includes('ORDER BY id DESC')) return [{ id: VERSION_ID, state: 'rejected' }];
          return [];
        });
        manager.findOne = jest.fn().mockResolvedValue({
          id: VERSION_ID,
          coworker_package_id: PACKAGE_ID,
          state: CoworkerVersionState.REJECTED,
          version_no: 1,
        });
        return cb(manager);
      });
      service = new CoworkerUploadService(packageRepo, versionRepo, dataSource, avatarUrl, permissionQuery, itemMeta);
      const result = await service.editVersion(VERSION_ID, { ...dto } as any, USER_ID);
      expect(result.version).toEqual({ id: VERSION_ID, version_no: 1 });
    });

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
