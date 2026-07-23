import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RedisAdapter } from '@common/infrastructure/redis.adapter';
import { OwnerScopeResolverService } from '@common/authorization/services/owner-scope-resolver.service';
import { PermissionCacheService } from '@common/authorization/services/permission-cache.service';
import { BiPaymentDocument } from '@modules/databases/bi-payment-document.entity';
import { BiPaymentTemplate } from '@modules/databases/bi-payment-template.entity';
import { BiPaymentLogMergeFile } from '@modules/databases/bi-payment-log-merge-file.entity';
import { BiPaymentProgram } from '@modules/databases/bi-payment-program.entity';
import { MaToolWorkstepType } from '@common/enums/ma-tool.enums';
import { BiPaymentDocumentService } from '../bi-payment-document.service';
import { StepScopeService } from '../../common/step-scope.service';
import type { DataScope } from '@common/authorization/types/data-scope.types';

jest.mock('@common/infrastructure/redis.adapter');

const USER_ID = 100;
const PROGRAM_ID = 5;

// Minimal QueryBuilder mock capturing emitted WHERE clauses + params.
// The real service uses docRepo.createQueryBuilder('d').innerJoin('d.template','t'...)
// and chains .where/.andWhere. We record fragments + params so specs assert
// the step-scope predicate (t.workstep_type IN ...) and applyDataScope call.
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
    setParameter: jest.fn((k: string, v: unknown) => {
      capturedParams[k] = v;
      return qb;
    }),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
    getCount: jest.fn().mockResolvedValue(0),
    getOne: jest.fn(),
    getRawOne: jest.fn(),
    getRawMany: jest.fn(),
    capturedWheres,
    capturedParams,
  };
  return qb;
}

// list() now requires SortCamelParams + PaginationParams (Strapi parity filters + pagination).
const sortParams = { sort_field: 'created_at', sort_order: 'DESC' } as any;
const pagination = { page: 1, limit: 10, skip: 0 } as any;

describe('BiPaymentDocumentService.list — step-scoped', () => {
  const queryService = {
    getUserPermissions: jest.fn(),
    getAccessibleRecords: jest.fn(),
    getUserIdsByRole: jest.fn(),
  };
  const dsQuery = jest.fn();
  const ds = { query: dsQuery } as unknown as DataSource;
  let permissionCache: PermissionCacheService;
  let ownerScope: OwnerScopeResolverService;
  let stepScope: StepScopeService;
  let service: BiPaymentDocumentService;
  let docRepo: any;
  const emptyScope: DataScope | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    (RedisAdapter.get as jest.Mock).mockResolvedValue(null);
    (RedisAdapter.set as jest.Mock).mockResolvedValue(undefined);
    (RedisAdapter.unlinkKeyByPattern as jest.Mock).mockResolvedValue([]);
    dsQuery.mockReset();

    permissionCache = new PermissionCacheService(queryService as any);
    ownerScope = new OwnerScopeResolverService(ds, permissionCache);
    stepScope = new StepScopeService(permissionCache, ownerScope);

    // createQueryBuilder returns a FRESH qb per call, exposing the last one for
    // assertions via docRepo.lastQb.
    docRepo = {
      createQueryBuilder: jest.fn().mockImplementation(() => {
        docRepo.lastQb = makeQueryBuilder();
        return docRepo.lastQb;
      }),
      lastQb: null as any,
    };
    service = new BiPaymentDocumentService(
      docRepo,
      { findOne: jest.fn() } as any, // templateRepo
      { findOne: jest.fn() } as any, // mergeRepo
      { createQueryBuilder: jest.fn() } as any, // programRepo (unused by list now)
      stepScope,
      permissionCache,
    );
  });

  const query = (overrides: Record<string, unknown> = {}) => ({ programId: PROGRAM_ID, ...overrides }) as any;

  // Test A: missing programId → BadRequest.
  it('missing programId → BadRequestException', async () => {
    await expect(service.list(undefined, query({ programId: undefined }), USER_ID, sortParams, pagination)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  // Test B: invalid programId (0 / negative) → BadRequest.
  it('programId <= 0 → BadRequestException', async () => {
    await expect(service.list(0 as any, query({ programId: 0 }), USER_ID, sortParams, pagination)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('view-only program → empty 200 response', async () => {
    jest.spyOn(stepScope, 'resolveWorkstepScopesOrEmpty').mockResolvedValue(new Map());

    const out = await service.list(PROGRAM_ID, query(), USER_ID, sortParams, pagination);

    expect(out).toEqual({ data: [], total: 0 });
    expect(docRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  // Test C: non-SO with upload at program, no workstep → all worksteps.
  // No per-record data-scope: query must NOT carry the applyDataScope predicate.
  it('non-SO upload at program, no workstep → filter all worksteps, no data-scope', async () => {
    dsQuery.mockResolvedValueOnce([{ resource_type: 'bicc_department', resource_id: 1, role_id: 7 }]);
    dsQuery.mockResolvedValueOnce([]); // isInOwnedScope false
    queryService.getAccessibleRecords.mockImplementation((_u, _t, code) =>
      Promise.resolve(code === 'bp_program_upload' ? [PROGRAM_ID] : []),
    );

    await service.list(PROGRAM_ID, query(), USER_ID, sortParams, pagination);

    // createQueryBuilder returned the shared qb; inspect its where/andWhere fragments.
    const sharedQb = docRepo.lastQb;
    const fragments: string[] = sharedQb.capturedWheres;
    const joined = fragments.join(' | ');
    expect(joined).toContain('t.workstep_type IN (:...fullWorksteps)');
    expect(sharedQb.capturedParams.fullWorksteps).toEqual(
      expect.arrayContaining([
        MaToolWorkstepType.PREPARE,
        MaToolWorkstepType.EX_PREPARE,
        MaToolWorkstepType.RECON_DATA,
        MaToolWorkstepType.RECON_FEEDBACK,
      ]),
    );
    // Visibility = step×program: no per-record data-scope predicate (no 1=0, no dsExplicit/EXISTS).
    expect(joined).not.toContain('1 = 0');
    expect(joined).not.toContain('dsExplicit_');
    expect(joined).not.toContain('EXISTS');
  });

  // Test D: non-SO with upload_recon at program, no workstep → recon_data own-only.
  it('non-SO upload_recon at program, no workstep → recon_data own-only', async () => {
    dsQuery.mockResolvedValueOnce([{ resource_type: 'bicc_department', resource_id: 1, role_id: 7 }]);
    dsQuery.mockResolvedValueOnce([]);
    queryService.getAccessibleRecords.mockImplementation((_u, _t, code) =>
      Promise.resolve(code === 'bp_program_upload_recon' ? [PROGRAM_ID] : []),
    );

    await service.list(PROGRAM_ID, query(), USER_ID, sortParams, pagination);

    const sharedQb = docRepo.lastQb;
    const joined = sharedQb.capturedWheres.join(' | ');
    expect(joined).toContain('t.workstep_type IN (:...ownWorksteps) AND d.uploaded_by_id = :scopeUserId');
    expect(sharedQb.capturedParams.ownWorksteps).toEqual([MaToolWorkstepType.RECON_DATA]);
    expect(sharedQb.capturedParams.scopeUserId).toBe(USER_ID);
  });

  // Test E: workstep=recon_data + upload_recon → query contains step filter + own filter.
  it('workstep=recon_data + upload_recon → single-step own filter applied', async () => {
    dsQuery.mockResolvedValueOnce([{ resource_type: 'bicc_department', resource_id: 1, role_id: 7 }]);
    dsQuery.mockResolvedValueOnce([]);
    queryService.getAccessibleRecords.mockImplementation((_u, _t, code) =>
      Promise.resolve(code === 'bp_program_upload_recon' ? [PROGRAM_ID] : []),
    );

    await service.list(PROGRAM_ID, query({ workstep: MaToolWorkstepType.RECON_DATA }), USER_ID, sortParams, pagination);
    const joined = docRepo.lastQb.capturedWheres.join(' | ');
    expect(joined).toContain('t.workstep_type = :wt');
    expect(joined).toContain('d.uploaded_by_id = :scopeUserId');
  });

  // Test G: no code at program → empty 200 response.
  it('non-SO with no code at program → empty 200 response', async () => {
    dsQuery.mockResolvedValueOnce([{ resource_type: 'bicc_department', resource_id: 1, role_id: 7 }]);
    dsQuery.mockResolvedValueOnce([]);
    queryService.getAccessibleRecords.mockResolvedValue([]);

    const out = await service.list(PROGRAM_ID, query(), USER_ID, sortParams, pagination);
    expect(out).toEqual({ data: [], total: 0 });
    expect(docRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  // Test E2 (SO): SO owner → all worksteps; no Forbidden.
  it('SO owner → all worksteps allowed, resolves without throwing', async () => {
    dsQuery
      .mockResolvedValueOnce([{ resource_type: 'bicc_department', resource_id: 1, role_id: 7 }])
      .mockResolvedValueOnce([{ exists: 1 }]); // isInOwnedScope true

    const result = await service.list(PROGRAM_ID, query(), USER_ID, sortParams, pagination);
    expect(result.data).toEqual([]);
    expect(queryService.getAccessibleRecords).not.toHaveBeenCalled();
  });

  // Test H: non-SO with approve at program → prepare + ex_prepare.
  it('non-SO with approve at program → allowed includes prepare + ex_prepare, no data-scope', async () => {
    dsQuery.mockResolvedValueOnce([{ resource_type: 'bicc_department', resource_id: 1, role_id: 7 }]);
    dsQuery.mockResolvedValueOnce([]);
    queryService.getAccessibleRecords.mockImplementation((_u, _t, code) =>
      Promise.resolve(code === 'bp_program_approve' ? [PROGRAM_ID] : []),
    );

    await service.list(PROGRAM_ID, query(), USER_ID, sortParams, pagination);

    const sharedQb = docRepo.lastQb;
    expect(sharedQb.capturedParams.fullWorksteps).toEqual(
      expect.arrayContaining([MaToolWorkstepType.PREPARE, MaToolWorkstepType.EX_PREPARE]),
    );
    expect(sharedQb.capturedParams.fullWorksteps).not.toContain(MaToolWorkstepType.RECON_DATA);
    // No per-record data-scope predicate — visibility = step×program.
    expect(sharedQb.capturedWheres.join(' | ')).not.toContain('1 = 0');
  });

  // Test I: workstepCurrent filters the PROGRAM's workstep_current (Strapi parity),
  // NOT document_status. Query must contain pg.workstep_current = :wsc.
  it('workstepCurrent filters pg.workstep_current, not d.document_status', async () => {
    dsQuery.mockResolvedValueOnce([{ resource_type: 'bicc_department', resource_id: 1, role_id: 7 }]);
    dsQuery.mockResolvedValueOnce([]);
    queryService.getAccessibleRecords.mockImplementation((_u, _t, code) =>
      Promise.resolve(code === 'bp_program_upload' ? [PROGRAM_ID] : []),
    );

    await service.list(
      PROGRAM_ID,
      query({ workstepCurrent: 'preparing' as any }),
      USER_ID,
      sortParams,
      pagination,
    );

    const sharedQb = docRepo.lastQb;
    const joined = sharedQb.capturedWheres.join(' | ');
    expect(joined).toContain('pg.workstep_current = :wsc');
    expect(sharedQb.capturedParams.wsc).toBe('preparing');
    // Must NOT have used the old buggy document_status mapping for workstepCurrent.
    expect(joined).not.toMatch(/d\.document_status = :wsc/);
  });

  // Test J: Strapi-parity filters present when params supplied.
  it('applies keyword (document_name), uploadMethod (template), version (template), dates', async () => {
    dsQuery.mockResolvedValueOnce([{ resource_type: 'bicc_department', resource_id: 1, role_id: 7 }]);
    dsQuery.mockResolvedValueOnce([]);
    queryService.getAccessibleRecords.mockResolvedValue([PROGRAM_ID]);

    await service.list(
      PROGRAM_ID,
      query({
        uploadMethod: 'manual',
        version: 2,
        startingDate: '2026-01-01',
        endingDate: '2026-12-31',
        s3UploadStatus: 'uploaded',
        status: 'submit',
      }),
      USER_ID,
      sortParams,
      pagination,
    );

    const joined = docRepo.lastQb.capturedWheres.join(' | ');
    expect(joined).toContain('t.upload_method = :um');
    expect(joined).toContain('t.version = :ver');
    expect(joined).toContain('d.created_at >= :startDate');
    expect(joined).toContain('d.created_at <= :endDate');
    expect(joined).toContain('d.s3_upload_status = :s3');
    expect(joined).toContain('d.document_status = :st');
  });

  // Test K: approvedByIds / updatedByIds filters (IFindDocument parity). These
  // backed the previously-missing user-id filters — they must emit IN predicates
  // on the new approved_by_id / updated_by_id columns.
  it('approvedByIds + updatedByIds emit IN predicates on the new columns', async () => {
    dsQuery.mockResolvedValueOnce([{ resource_type: 'bicc_department', resource_id: 1, role_id: 7 }]);
    dsQuery.mockResolvedValueOnce([]);
    queryService.getAccessibleRecords.mockResolvedValue([PROGRAM_ID]);

    await service.list(
      PROGRAM_ID,
      query({ approvedByIds: '10,11', updatedByIds: '20,21' }),
      USER_ID,
      sortParams,
      pagination,
    );

    const joined = docRepo.lastQb.capturedWheres.join(' | ');
    expect(joined).toContain('d.approved_by_id IN (:...abids)');
    expect(joined).toContain('d.updated_by_id IN (:...ubids)');
    expect(docRepo.lastQb.capturedParams.abids).toEqual([10, 11]);
    expect(docRepo.lastQb.capturedParams.ubids).toEqual([20, 21]);
  });

  // Test L: keyword free-text filter (IFindDocument via IBaseSearch). Strapi
  // filters doc.name OR doc.description → NestJS document_name OR notes (ILIKE).
  it('keyword emits ILIKE over document_name OR notes', async () => {
    dsQuery.mockResolvedValueOnce([{ resource_type: 'bicc_department', resource_id: 1, role_id: 7 }]);
    dsQuery.mockResolvedValueOnce([]);
    queryService.getAccessibleRecords.mockResolvedValue([PROGRAM_ID]);

    await service.list(PROGRAM_ID, query({ keyword: 'invoice' }), USER_ID, sortParams, pagination);

    const joined = docRepo.lastQb.capturedWheres.join(' | ');
    expect(joined).toContain('d.document_name ILIKE :kw');
    expect(joined).toContain('d.notes ILIKE :kw');
    expect(docRepo.lastQb.capturedParams.kw).toBe('%invoice%');
  });
});
