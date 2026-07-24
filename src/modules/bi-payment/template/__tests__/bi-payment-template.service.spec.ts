import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RedisAdapter } from '@common/infrastructure/redis.adapter';
import { OwnerScopeResolverService } from '@common/authorization/services/owner-scope-resolver.service';
import { PermissionCacheService } from '@common/authorization/services/permission-cache.service';
import { BiPaymentTemplate } from '@modules/databases/bi-payment-template.entity';
import { BiPaymentProgram } from '@modules/databases/bi-payment-program.entity';
import { BiPaymentProject } from '@modules/databases/bi-payment-project.entity';
import { MaToolWorkstepType } from '@common/enums/ma-tool.enums';
import { BiPaymentTemplateService } from '../bi-payment-template.service';
import { StepScopeService } from '../../common/step-scope.service';

jest.mock('@common/infrastructure/redis.adapter');

const USER_ID = 100;
const PROGRAM_ID = 5;
const PROJECT_ID = 3;

const sortParams = { sort_field: 'created_at', sort_order: 'DESC' } as any;
const pagination = { page: 1, limit: 10, skip: 0 } as any;

// Minimal QueryBuilder mock capturing emitted WHERE fragments + params so specs
// assert step-scope predicate (t.workstep_type IN ...) and filter fragments
// without hitting a database. Mirrors the document step-scope spec.
function makeQueryBuilder() {
  const capturedWheres: string[] = [];
  const capturedParams: Record<string, unknown> = {};
  const qb: any = {
    innerJoin: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    innerJoinAndSelect: jest.fn().mockReturnThis(),
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
    setParameter: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
    getCount: jest.fn().mockResolvedValue(0),
    getOne: jest.fn(),
    getRawOne: jest.fn().mockResolvedValue({ count: '1' }),
    getRawMany: jest.fn().mockResolvedValue([]),
    capturedWheres,
    capturedParams,
  };
  return qb;
}

describe('BiPaymentTemplateService', () => {
  const queryService = { getUserPermissions: jest.fn(), getAccessibleRecords: jest.fn(), getUserIdsByRole: jest.fn() };
  const dsQuery = jest.fn();
  const ds = { query: dsQuery } as unknown as DataSource;
  let permissionCache: PermissionCacheService;
  let ownerScope: OwnerScopeResolverService;
  let stepScope: StepScopeService;
  let service: BiPaymentTemplateService;
  let repo: any;
  let programRepo: any;
  let projectRepo: any;

  beforeEach(() => {
    jest.clearAllMocks();
    (RedisAdapter.get as jest.Mock).mockResolvedValue(null);
    (RedisAdapter.set as jest.Mock).mockResolvedValue(undefined);
    (RedisAdapter.unlinkKeyByPattern as jest.Mock).mockResolvedValue([]);
    dsQuery.mockReset();

    permissionCache = new PermissionCacheService(queryService as any);
    ownerScope = new OwnerScopeResolverService(ds, permissionCache);
    stepScope = new StepScopeService(permissionCache, ownerScope);

    repo = {
      createQueryBuilder: jest.fn().mockImplementation(() => {
        repo.lastQb = makeQueryBuilder();
        return repo.lastQb;
      }),
      create: jest.fn((x: any) => x),
      save: jest.fn(async (x: any) => (Array.isArray(x) ? x : { ...x, id: 1 })),
      softRemove: jest.fn().mockResolvedValue(undefined),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      lastQb: null as any,
    };
    programRepo = { findOne: jest.fn().mockResolvedValue(null) };
    projectRepo = { findOne: jest.fn().mockResolvedValue(null) };
    (ds as any).transaction = jest.fn(async (cb: any) => cb({ getRepository: () => repo }));

    service = new BiPaymentTemplateService(repo, programRepo, projectRepo, ds, stepScope, permissionCache);
  });

  // ----- search -----
  const searchQuery = (overrides: Record<string, unknown> = {}) =>
    ({ programId: PROGRAM_ID, ...overrides }) as any;

  // SO owner path: isInOwnedScope true → all worksteps, no Forbidden.
  const mockSO = () => {
    dsQuery.mockResolvedValueOnce([{ resource_type: 'bicc_department', resource_id: 1, role_id: 7 }]);
    dsQuery.mockResolvedValueOnce([{ one: 1 }]); // isInOwnedScope true
  };
  // non-SO with upload code at program → allowed = all worksteps.
  const mockUploadFull = () => {
    dsQuery.mockResolvedValueOnce([{ resource_type: 'bicc_department', resource_id: 1, role_id: 7 }]);
    dsQuery.mockResolvedValueOnce([]); // isInOwnedScope false
    queryService.getAccessibleRecords.mockImplementation((_u, _t, code) =>
      Promise.resolve(code === 'bp_program_upload' ? [PROGRAM_ID] : []),
    );
  };

  describe('search — step-scoped', () => {
    it('missing programId → BadRequestException', async () => {
      await expect(service.search(USER_ID, searchQuery({ programId: undefined }), sortParams, pagination)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('view-only program → empty response', async () => {
      jest.spyOn(stepScope, 'hasProgramCapability').mockResolvedValue(false);
      jest.spyOn(stepScope, 'resolveWorkstepScopesOrEmpty').mockResolvedValue(new Map());
      const out = await service.search(USER_ID, searchQuery(), sortParams, pagination);
      expect(out).toEqual({ data: [], meta: { total: 0, page: 1, limit: 10 } });
      expect(repo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('non-SO upload at program → all worksteps, no data-scope', async () => {
      mockUploadFull();
      jest.spyOn(stepScope, 'hasProgramCapability').mockResolvedValue(false);
      await service.search(USER_ID, searchQuery(), sortParams, pagination);
      const qb = repo.lastQb;
      const joined = qb.capturedWheres.join(' | ');
      expect(joined).toContain('t.workstep_type IN (:...wts)');
      expect(qb.capturedParams.wts).toEqual(
        expect.arrayContaining([
          MaToolWorkstepType.PREPARE,
          MaToolWorkstepType.EX_PREPARE,
          MaToolWorkstepType.RECON_DATA,
          MaToolWorkstepType.RECON_FEEDBACK,
        ]),
      );
      // Visibility = step×program: no per-record data-scope predicate.
      expect(joined).not.toContain('1 = 0');
    });

    it('workstepType=recon_data with upload at program → allowed', async () => {
      mockUploadFull();
      jest.spyOn(stepScope, 'hasProgramCapability').mockResolvedValue(false);
      await expect(
        service.search(USER_ID, searchQuery({ workstepType: MaToolWorkstepType.RECON_DATA }), sortParams, pagination),
      ).resolves.toBeDefined();
    });

    it('workstepType=recon_data but only view → empty response', async () => {
      jest.spyOn(stepScope, 'hasProgramCapability').mockResolvedValue(false);
      jest.spyOn(stepScope, 'resolveWorkstepScopesOrEmpty').mockResolvedValue(new Map());
      const out = await service.search(USER_ID, searchQuery({ workstepType: MaToolWorkstepType.RECON_DATA }), sortParams, pagination);
      expect(out).toEqual({ data: [], meta: { total: 0, page: 1, limit: 10 } });
      expect(repo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('SO owner → all worksteps, no throw', async () => {
      mockSO();
      await service.search(USER_ID, searchQuery(), sortParams, pagination);
      const qb = repo.lastQb;
      expect(qb.capturedWheres.join(' | ')).toContain('t.workstep_type IN (:...wts)');
      expect(qb.capturedParams.wts.length).toBeGreaterThanOrEqual(3);
    });

    it('filters: version + createdByIds + keyword applied', async () => {
      mockSO();
      await service.search(
        USER_ID,
        searchQuery({ version: 2, createdByIds: '10,11', keyword: 'abc' }),
        sortParams,
        pagination,
      );
      const joined = repo.lastQb.capturedWheres.join(' | ');
      expect(joined).toContain('t.version = :ver');
      expect(joined).toContain('t.template_created_by_id IN (:...cbids)');
      expect(joined).toContain('t.name ILIKE :kw');
      expect(repo.lastQb.capturedParams.ver).toBe(2);
    });

    it('non-SO no code at program → empty response', async () => {
      jest.spyOn(stepScope, 'hasProgramCapability').mockResolvedValue(false);
      jest.spyOn(stepScope, 'resolveWorkstepScopesOrEmpty').mockResolvedValue(new Map());
      const out = await service.search(USER_ID, searchQuery(), sortParams, pagination);
      expect(out).toEqual({ data: [], meta: { total: 0, page: 1, limit: 10 } });
      expect(repo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('invalid workstepType value → BadRequestException (no silent fallback)', async () => {
      mockSO();
      await expect(
        service.search(USER_ID, searchQuery({ workstepType: 'bogus' }), sortParams, pagination),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    // bp_template_create mở full-view mọi workstep trong program, bất kể content-view.
    // Người hold create-code (không có upload/recon) vẫn thấy hết template để duplicate.
    it('non-SO with bp_template_create only → all worksteps (no upload/view needed)', async () => {
      // resolveWorkstepScopes sẽ trả rỗng (không có content code), nhưng create-capability
      // trả true → service phải vẫn query với full workstep set.
      jest.spyOn(stepScope, 'resolveWorkstepScopesOrEmpty').mockResolvedValue(new Map());
      jest
        .spyOn(stepScope, 'hasProgramCapability')
        .mockImplementation((_u, _p, code) => Promise.resolve(code === 'bp_template_create'));

      await service.search(USER_ID, searchQuery(), sortParams, pagination);
      const qb = repo.lastQb;
      expect(qb.capturedParams.wts).toEqual(
        expect.arrayContaining([
          MaToolWorkstepType.PREPARE,
          MaToolWorkstepType.EX_PREPARE,
          MaToolWorkstepType.RECON_DATA,
          MaToolWorkstepType.RECON_FEEDBACK,
        ]),
      );
      expect(stepScope.hasProgramCapability).toHaveBeenCalledWith(USER_ID, PROGRAM_ID, 'bp_template_create');
    });

    it('non-SO with neither create nor content code → empty response', async () => {
      jest.spyOn(stepScope, 'resolveWorkstepScopesOrEmpty').mockResolvedValue(new Map());
      jest.spyOn(stepScope, 'hasProgramCapability').mockResolvedValue(false);
      const out = await service.search(USER_ID, searchQuery(), sortParams, pagination);
      expect(out).toEqual({ data: [], meta: { total: 0, page: 1, limit: 10 } });
      expect(repo.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  // ----- details -----
  describe('details — flags + step-scope', () => {
    const tpl = (overrides: any = {}) =>
      ({
        id: 1,
        bi_payment_program_id: PROGRAM_ID,
        workstep_type: MaToolWorkstepType.PREPARE,
        template_type: 'bi-payment',
        ...overrides,
      }) as any as BiPaymentTemplate;

    it('admin bypasses step-scope; returns is_uploader + canDuplicate', async () => {
      repo.createQueryBuilder = jest.fn().mockImplementation(() => {
        const qb = makeQueryBuilder();
        qb.getOne = jest.fn().mockResolvedValue(tpl());
        repo.lastQb = qb;
        return qb;
      });
      const out = await service.details(1, USER_ID, { isAdmin: true });
      expect(out.is_uploader).toBe(true);
      expect(out.canDuplicate).toBe(true);
    });

    it('non-admin with upload at program → canDuplicate resolves true when create-code held', async () => {
      mockUploadFull();
      repo.createQueryBuilder = jest.fn().mockImplementation(() => {
        const qb = makeQueryBuilder();
        qb.getOne = jest.fn().mockResolvedValue(tpl());
        repo.lastQb = qb;
        return qb;
      });
      queryService.getAccessibleRecords.mockImplementation((_u, _t, code) =>
        Promise.resolve(code === 'bp_program_upload' || code === 'bp_template_create' ? [PROGRAM_ID] : []),
      );
      const out = await service.details(1, USER_ID, { isAdmin: false });
      expect(out.canDuplicate).toBe(true);
    });

    it('not found → NotFoundException', async () => {
      repo.createQueryBuilder = jest.fn().mockImplementation(() => {
        const qb = makeQueryBuilder();
        qb.getOne = jest.fn().mockResolvedValue(null);
        return qb;
      });
      await expect(service.details(99, USER_ID, { isAdmin: true })).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('create / duplicate / delete — program capability, not view permission', () => {
    const createDto = () =>
      ({
        name: 'template-a',
        description: 'desc',
        uploadMethod: 'manual',
        projectId: PROJECT_ID,
        programId: PROGRAM_ID,
        workstepType: MaToolWorkstepType.PREPARE,
      }) as any;

    it('create succeeds with template_create even if view scope is empty', async () => {
      jest.spyOn(stepScope, 'resolveWorkstepScopesOrEmpty').mockResolvedValue(new Map());
      const capabilitySpy = jest.spyOn(stepScope, 'hasProgramCapability').mockResolvedValue(true);
      programRepo.findOne = jest.fn().mockResolvedValue({ id: PROGRAM_ID, version: 1, is_deleted: false });
      projectRepo.findOne = jest.fn().mockResolvedValue({ id: PROJECT_ID, project_status: 'active', is_deleted: false });
      repo.findOne = jest.fn().mockResolvedValue(null);
      const out = await service.create(createDto(), USER_ID);

      expect(out).toEqual({ id: 1, name: 'template-a' });
      expect(capabilitySpy).toHaveBeenCalledWith(USER_ID, PROGRAM_ID, 'bp_template_create');
      expect(stepScope.resolveWorkstepScopesOrEmpty).not.toHaveBeenCalled();
    });

    it('duplicateMany succeeds with create code on source and target, regardless of view scope', async () => {
      jest.spyOn(stepScope, 'resolveWorkstepScopesOrEmpty').mockResolvedValue(new Map());
      jest.spyOn(stepScope, 'hasProgramCapability').mockResolvedValue(true);
      programRepo.findOne = jest.fn().mockResolvedValue({ id: PROGRAM_ID + 1, version: 2, is_deleted: false });
      repo.save = jest.fn(async (x: any) => (Array.isArray(x) ? x.map((item: any, index: number) => ({ ...item, id: index + 1 })) : { ...x, id: 1 }));
      repo.find = jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { id: 11, name: 'copy-a', description: 'src', upload_method: 'manual', workstep_type: MaToolWorkstepType.PREPARE },
        ]);
      const out = await service.duplicateMany(
        {
          fromProgramId: PROGRAM_ID,
          toProgramId: PROGRAM_ID + 1,
          fromProjectId: PROJECT_ID,
          listTemplate: [{ id: 11, name: 'copy-a' }],
        } as any,
        USER_ID,
      );

      expect(out.template_duplicate).toEqual([{ id: 1, name: 'copy-a' }]);
      expect(stepScope.hasProgramCapability).toHaveBeenCalledWith(USER_ID, PROGRAM_ID, 'bp_template_create');
      expect(stepScope.hasProgramCapability).toHaveBeenCalledWith(USER_ID, PROGRAM_ID + 1, 'bp_template_create');
    });

    it('delete succeeds with delete code even when view scope is empty', async () => {
      jest.spyOn(stepScope, 'resolveWorkstepScopesOrEmpty').mockResolvedValue(new Map());
      const capabilitySpy = jest.spyOn(stepScope, 'hasProgramCapability').mockResolvedValue(true);
      repo.createQueryBuilder = jest.fn().mockImplementation(() => {
        const qb = makeQueryBuilder();
        qb.getOne = jest.fn().mockResolvedValue({
          id: 1,
          bi_payment_program_id: PROGRAM_ID,
          bi_payment_program: { project: { project_status: 'active' } },
          documents: [],
        });
        return qb;
      });
      const out = await service.delete(1, USER_ID, { isAdmin: false });

      expect(out).toEqual({ id: 1 });
      expect(capabilitySpy).toHaveBeenCalledWith(USER_ID, PROGRAM_ID, 'bp_template_delete');
    });
  });

  // ----- delete -----
  describe('delete — doc-link + project-active + step-scope', () => {
    const tplWith = (docs: any[], projectStatus: string) =>
      ({
        id: 1,
        bi_payment_program_id: PROGRAM_ID,
        workstep_type: MaToolWorkstepType.PREPARE,
        is_deleted: false,
        bi_payment_program: { project: { project_status: projectStatus } },
        documents: docs,
      }) as any as BiPaymentTemplate;

    it('has non-draft document → BadRequest', async () => {
      repo.createQueryBuilder = jest.fn().mockImplementation(() => {
        const qb = makeQueryBuilder();
        qb.getOne = jest.fn().mockResolvedValue(tplWith([{ document_status: 'submit' }], 'active'));
        return qb;
      });
      await expect(service.delete(1, USER_ID, { isAdmin: true })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('project inactive → BadRequest', async () => {
      repo.createQueryBuilder = jest.fn().mockImplementation(() => {
        const qb = makeQueryBuilder();
        qb.getOne = jest.fn().mockResolvedValue(tplWith([], 'inactive'));
        return qb;
      });
      await expect(service.delete(1, USER_ID, { isAdmin: true })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('admin, active project, no docs → soft-delete via softRemove (sets deleted_at)', async () => {
      repo.createQueryBuilder = jest.fn().mockImplementation(() => {
        const qb = makeQueryBuilder();
        qb.getOne = jest.fn().mockResolvedValue(tplWith([], 'active'));
        return qb;
      });
      const out = await service.delete(1, USER_ID, { isAdmin: true });
      expect(out).toEqual({ id: 1 });
      // softRemove sets deleted_at (the column read paths filter on); setting
      // is_deleted alone would leave the row visible. Assert the real delete path.
      expect(repo.softRemove).toHaveBeenCalledTimes(1);
    });

    it('not found → NotFoundException', async () => {
      repo.createQueryBuilder = jest.fn().mockImplementation(() => {
        const qb = makeQueryBuilder();
        qb.getOne = jest.fn().mockResolvedValue(null);
        return qb;
      });
      await expect(service.delete(99, USER_ID, { isAdmin: true })).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ----- user-created / user-updated (distinct users) -----
  describe('listUserCreated — distinct users', () => {
    it('admin → no program filter; returns mapped users + real total', async () => {
      let call = 0;
      repo.createQueryBuilder = jest.fn().mockImplementation(() => {
        const qb = makeQueryBuilder();
        // call 1 = count query (getRawOne), call 2 = page query (getRawMany).
        if (call === 0) {
          qb.getRawOne = jest.fn().mockResolvedValue({ count: '7' });
        } else {
          qb.getRawMany = jest.fn().mockResolvedValue([{ id: 5, email: 'a@x.com' }]);
          repo.lastQb = qb;
        }
        call++;
        return qb;
      });
      const out = await service.listUserCreated(undefined, pagination, USER_ID, { isAdmin: true });
      expect(out.data).toEqual([{ id: 5, email: 'a@x.com' }]);
      expect(out.meta.total).toBe(7);
      expect(repo.lastQb.capturedWheres.join(' | ')).not.toContain('bi_payment_program_id IN');
    });

    it('non-admin, no accessible programs → empty', async () => {
      queryService.getAccessibleRecords.mockResolvedValue([]);
      const out = await service.listUserCreated(undefined, pagination, USER_ID, { isAdmin: false });
      expect(out.data).toEqual([]);
    });

    it('non-admin, accessible programs → filter bi_payment_program_id IN', async () => {
      queryService.getAccessibleRecords.mockResolvedValue([PROGRAM_ID]);
      let call = 0;
      repo.createQueryBuilder = jest.fn().mockImplementation(() => {
        const qb = makeQueryBuilder();
        if (call === 0) {
          qb.getRawOne = jest.fn().mockResolvedValue({ count: '3' });
        } else {
          qb.getRawMany = jest.fn().mockResolvedValue([{ id: 5, email: 'a@x.com' }]);
          repo.lastQb = qb;
        }
        call++;
        return qb;
      });
      const out = await service.listUserCreated('a', pagination, USER_ID, { isAdmin: false });
      expect(out.data).toEqual([{ id: 5, email: 'a@x.com' }]);
      expect(out.meta.total).toBe(3);
      expect(repo.lastQb.capturedWheres.join(' | ')).toContain('t.bi_payment_program_id IN (:...crossUploadPrograms)');
    });

    it('listUserUpdated uses template_updated_by_id column', async () => {
      queryService.getAccessibleRecords.mockResolvedValue([PROGRAM_ID]);
      let call = 0;
      repo.createQueryBuilder = jest.fn().mockImplementation(() => {
        const qb = makeQueryBuilder();
        if (call === 0) {
          qb.getRawOne = jest.fn().mockResolvedValue({ count: '0' });
        } else {
          qb.getRawMany = jest.fn().mockResolvedValue([]);
          repo.lastQb = qb;
        }
        call++;
        return qb;
      });
      await service.listUserUpdated(undefined, pagination, USER_ID, { isAdmin: false });
      const joined = repo.lastQb.capturedWheres.join(' | ');
      expect(joined).toContain('t.template_updated_by_id IS NOT NULL');
    });
  });
});
