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
  // non-SO with preparing code at program → allowed = {prepare, ex_prepare}.
  const mockPrepareOnly = () => {
    dsQuery.mockResolvedValueOnce([{ resource_type: 'bicc_department', resource_id: 1, role_id: 7 }]);
    dsQuery.mockResolvedValueOnce([]); // isInOwnedScope false
    queryService.getAccessibleRecords.mockImplementation((_u, _t, code) =>
      Promise.resolve(code === 'bp_program_preparing' ? [PROGRAM_ID] : []),
    );
  };

  describe('search — step-scoped', () => {
    it('missing programId → BadRequestException', async () => {
      await expect(service.search(USER_ID, searchQuery({ programId: undefined }), sortParams, pagination)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('non-SO prepare at program → t.workstep_type IN (prepare, ex_prepare), no data-scope', async () => {
      mockPrepareOnly();
      await service.search(USER_ID, searchQuery(), sortParams, pagination);
      const qb = repo.lastQb;
      const joined = qb.capturedWheres.join(' | ');
      expect(joined).toContain('t.workstep_type IN (:...wts)');
      expect(qb.capturedParams.wts).toEqual(expect.arrayContaining([MaToolWorkstepType.PREPARE, MaToolWorkstepType.EX_PREPARE]));
      expect(qb.capturedParams.wts).not.toContain(MaToolWorkstepType.RECON_DATA);
      // Visibility = step×program: no per-record data-scope predicate.
      expect(joined).not.toContain('1 = 0');
    });

    it('workstepType=recon_data but only prepare → ForbiddenException', async () => {
      mockPrepareOnly();
      await expect(
        service.search(USER_ID, searchQuery({ workstepType: MaToolWorkstepType.RECON_DATA }), sortParams, pagination),
      ).rejects.toBeInstanceOf(ForbiddenException);
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

    it('non-SO no code at program → ForbiddenException', async () => {
      dsQuery.mockResolvedValueOnce([{ resource_type: 'bicc_department', resource_id: 1, role_id: 7 }]);
      dsQuery.mockResolvedValueOnce([]);
      queryService.getAccessibleRecords.mockResolvedValue([]);
      await expect(service.search(USER_ID, searchQuery(), sortParams, pagination)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('invalid workstepType value → BadRequestException (no silent fallback)', async () => {
      mockSO();
      await expect(
        service.search(USER_ID, searchQuery({ workstepType: 'bogus' }), sortParams, pagination),
      ).rejects.toBeInstanceOf(BadRequestException);
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

    it('non-admin with prepare at program → canDuplicate resolves true when create-code held', async () => {
      mockPrepareOnly();
      repo.createQueryBuilder = jest.fn().mockImplementation(() => {
        const qb = makeQueryBuilder();
        qb.getOne = jest.fn().mockResolvedValue(tpl());
        repo.lastQb = qb;
        return qb;
      });
      queryService.getAccessibleRecords.mockImplementation((_u, _t, code) =>
        Promise.resolve(code === 'bp_program_preparing' || code === 'bp_template_create' ? [PROGRAM_ID] : []),
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
      expect(repo.lastQb.capturedWheres.join(' | ')).toContain('t.bi_payment_program_id IN (:...pids)');
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
