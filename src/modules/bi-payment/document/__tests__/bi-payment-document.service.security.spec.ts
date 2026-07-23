import { ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RedisAdapter } from '@common/infrastructure/redis.adapter';
import { OwnerScopeResolverService } from '@common/authorization/services/owner-scope-resolver.service';
import { PermissionCacheService } from '@common/authorization/services/permission-cache.service';
import { BiPaymentProgressStatus } from '@common/enums/bi-payment.enums';
import { MaToolWorkstepType } from '@common/enums/ma-tool.enums';
import { BiPaymentDocument } from '@modules/databases/bi-payment-document.entity';
import { BiPaymentTemplate } from '@modules/databases/bi-payment-template.entity';
import { BiPaymentLogMergeFile } from '@modules/databases/bi-payment-log-merge-file.entity';
import { BiPaymentProgram } from '@modules/databases/bi-payment-program.entity';
import { BiPaymentDocumentService } from '../bi-payment-document.service';
import { StepScopeService } from '../../common/step-scope.service';
import type { DataScope } from '@common/authorization/types/data-scope.types';

jest.mock('@common/infrastructure/redis.adapter');

const USER_ID = 100;
const OTHER_USER_ID = 200;
const PROGRAM_ID = 5;
const RECON_SCOPE = new Map([[MaToolWorkstepType.RECON_DATA, { own: true }]]);

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
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
    getRawOne: jest.fn().mockResolvedValue({ total: '0', SUBMIT: '0', APPROVAL: '0', REJECTED: '0' }),
    getRawMany: jest.fn().mockResolvedValue([]),
    getOne: jest.fn(),
    capturedWheres,
    capturedParams,
  };
  return qb;
}

describe('BiPaymentDocumentService security', () => {
  const queryService = { getUserPermissions: jest.fn(), getAccessibleRecords: jest.fn(), getUserIdsByRole: jest.fn() };
  const dsQuery = jest.fn();
  const ds = { query: dsQuery } as unknown as DataSource;
  let permissionCache: PermissionCacheService;
  let ownerScope: OwnerScopeResolverService;
  let stepScope: StepScopeService;
  let service: BiPaymentDocumentService;
  let docRepo: any;
  let templateRepo: any;
  let mergeRepo: any;
  let programRepo: any;

  beforeEach(() => {
    jest.clearAllMocks();
    (RedisAdapter.get as jest.Mock).mockResolvedValue(null);
    (RedisAdapter.set as jest.Mock).mockResolvedValue(undefined);
    (RedisAdapter.unlinkKeyByPattern as jest.Mock).mockResolvedValue([]);
    dsQuery.mockReset();

    permissionCache = new PermissionCacheService(queryService as any);
    ownerScope = new OwnerScopeResolverService(ds, permissionCache);
    stepScope = new StepScopeService(permissionCache, ownerScope);

    docRepo = {
      createQueryBuilder: jest.fn().mockImplementation(() => {
        docRepo.lastQb = makeQueryBuilder();
        return docRepo.lastQb;
      }),
      save: jest.fn(async (x: any) => x),
      lastQb: null as any,
    };
    templateRepo = { findOne: jest.fn().mockResolvedValue(null) };
    mergeRepo = {
      create: jest.fn((x: any) => x),
      save: jest.fn(async (x: any) => ({ ...x, id: 99 })),
      findOne: jest.fn().mockResolvedValue(null),
    };
    programRepo = { createQueryBuilder: jest.fn() };

    service = new BiPaymentDocumentService(docRepo, templateRepo, mergeRepo, programRepo, stepScope, permissionCache);
  });

  const ownReconDoc = (overrides: Record<string, unknown> = {}) =>
    ({
      id: 1,
      program_id: PROGRAM_ID,
      uploaded_by_id: USER_ID,
      template: { workstep_type: MaToolWorkstepType.RECON_DATA },
      program: { progress_status: BiPaymentProgressStatus.INPROGRESS },
      document_status: 'submit',
      ...overrides,
    }) as any;

  const otherReconDoc = (overrides: Record<string, unknown> = {}) =>
    ownReconDoc({ id: 2, uploaded_by_id: OTHER_USER_ID, ...overrides });

  it.each(['findOne', 'download'] as const)('%s denies cross-user recon doc', async (method) => {
    jest.spyOn(stepScope, 'resolveWorkstepScopesOrEmpty').mockResolvedValue(RECON_SCOPE as any);
    docRepo.createQueryBuilder = jest.fn().mockImplementation(() => {
      const qb = makeQueryBuilder();
      qb.getOne = jest.fn().mockResolvedValue(otherReconDoc());
      return qb;
    });

    await expect(service[method](1, { isAdmin: false }, USER_ID)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('stats keeps own-only recon visibility and zeroes out view-only users', async () => {
    jest.spyOn(stepScope, 'resolveWorkstepScopesOrEmpty').mockResolvedValue(RECON_SCOPE as any);
    docRepo.createQueryBuilder = jest.fn().mockImplementation(() => {
      const qb = makeQueryBuilder();
      qb.getRawOne = jest.fn().mockResolvedValue({ total: '3', SUBMIT: '1', APPROVAL: '1', REJECTED: '1' });
      docRepo.lastQb = qb;
      return qb;
    });

    const out = await service.stats(PROGRAM_ID, { programId: PROGRAM_ID } as any, USER_ID);

    expect(out).toEqual({ total: 3, SUBMIT: 1, APPROVAL: 1, REJECTED: 1 });
    expect(docRepo.lastQb.capturedWheres.join(' | ')).toContain(
      't.workstep_type IN (:...ownWorksteps) AND d.uploaded_by_id = :scopeUserId',
    );
  });

  it('uploadStatus returns only own recon docs', async () => {
    jest.spyOn(stepScope, 'resolveWorkstepScopesOrEmpty').mockResolvedValue(RECON_SCOPE as any);
    docRepo.createQueryBuilder = jest.fn().mockImplementation(() => {
      const qb = makeQueryBuilder();
      qb.getMany = jest.fn().mockResolvedValue([ownReconDoc(), otherReconDoc()]);
      return qb;
    });

    const out = await service.uploadStatus('1,2', USER_ID);

    expect(out).toEqual([{ id: 1, s3_upload_status: undefined }]);
  });

  it.each([
    ['listUserCreated', 'd.uploaded_by_id'],
    ['listUserUpdated', 'd.updated_by_id'],
    ['listUserApproved', 'd.approved_by_id'],
    ['listUserRejected', 'd.rejected_by_id'],
  ] as const)('%s keeps the query anchored to accessible programs', async (method, userCol) => {
    jest.spyOn(stepScope, 'resolveGlobalWorkstepScopes').mockResolvedValue(RECON_SCOPE as any);
    jest.spyOn(service as any, 'getAccessibleProgramIds').mockResolvedValue([PROGRAM_ID]);
    let call = 0;
    docRepo.createQueryBuilder = jest.fn().mockImplementation(() => {
      const qb = makeQueryBuilder();
      if (call === 0) {
        qb.getRawOne = jest.fn().mockResolvedValue({ count: '2' });
      } else {
        qb.getRawMany = jest.fn().mockResolvedValue([{ id: USER_ID, email: 'me@example.com' }]);
        docRepo.lastQb = qb;
      }
      call++;
      return qb;
    });

    const out = await service[method]('me', { page: 1, limit: 10 } as any, USER_ID);

    expect(out.data).toEqual([{ id: USER_ID, email: 'me@example.com' }]);
    expect(out.meta.total).toBe(2);
    const joined = docRepo.lastQb.capturedWheres.join(' | ');
    expect(joined).toContain('d.program_id IN (:...crossUploadPrograms)');
    expect(joined).toContain('t.workstep_type IN (:...crossApproveWorksteps)');
    expect(joined).toContain('t.workstep_type = :crossReconWorkstep');
    expect(joined).toContain(`${userCol} = :crossScopeUserId`);
    expect(joined).toContain('d.uploaded_by_id = :crossScopeUserId');
  });

  it('submit only updates docs uploaded by the caller', async () => {
    jest
      .spyOn(stepScope, 'hasProgramCapability')
      .mockImplementation(async (_u, _p, code) => code === 'bp_program_upload_recon');
    docRepo.createQueryBuilder = jest.fn().mockImplementation(() => {
      const qb = makeQueryBuilder();
      qb.getMany = jest.fn().mockResolvedValue([ownReconDoc({ id: 1 }), otherReconDoc({ id: 2 })]);
      return qb;
    });

    const out = await service.updateStatus({ ids: [1, 2], status: 'submit' }, USER_ID);

    expect(out).toEqual({ success: 1, error: 1, idsSuccess: [1], idsError: [2] });
  });

  it.each(['approval', 'rejected'] as const)('%s only updates prepare docs with approve code', async (status) => {
    jest
      .spyOn(stepScope, 'hasProgramCapability')
      .mockImplementation(async (_u, _p, code) => code === 'bp_program_approve');
    docRepo.createQueryBuilder = jest.fn().mockImplementation(() => {
      const qb = makeQueryBuilder();
      qb.getMany = jest.fn().mockResolvedValue([
        {
          id: 1,
          program_id: PROGRAM_ID,
          program: { progress_status: BiPaymentProgressStatus.INPROGRESS },
          template: { workstep_type: MaToolWorkstepType.PREPARE },
          document_status: 'submit',
        },
        {
          id: 2,
          program_id: PROGRAM_ID,
          program: { progress_status: BiPaymentProgressStatus.INPROGRESS },
          template: { workstep_type: MaToolWorkstepType.RECON_DATA },
          document_status: 'submit',
        },
      ]);
      return qb;
    });

    const out = await service.updateStatus({ ids: [1, 2], status }, USER_ID);

    expect(out).toEqual({ success: 1, error: 1, idsSuccess: [1], idsError: [2] });
  });

  it('merge rejects users without bp_program_upload even if recon access exists', async () => {
    templateRepo.findOne.mockResolvedValue({ id: 7, bi_payment_program_id: PROGRAM_ID });
    jest
      .spyOn(stepScope, 'hasProgramCapability')
      .mockImplementation(async (_u, _p, code) => code === 'bp_program_upload_recon');

    await expect(
      service.merge({ documentIds: [1], mode: 'csv', templateId: 7 } as any, USER_ID),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets an SO owner poll a merge through the same owner-aware upload capability used to create it', async () => {
    mergeRepo.findOne.mockResolvedValue({
      id: 99,
      name: 'merge-program-5-csv',
      mode: 'csv',
      merge_status: 'processing',
      documents: [{ id: 1, program_id: PROGRAM_ID }],
    });
    jest.spyOn(service as any, 'getAccessibleProgramIds').mockResolvedValue([]);
    const capability = jest.spyOn(stepScope, 'hasProgramCapability').mockResolvedValue(true);

    await expect(service.getMergeStatus(99, { isAdmin: false }, USER_ID)).resolves.toMatchObject({ id: 99 });
    expect(capability).toHaveBeenCalledWith(USER_ID, PROGRAM_ID, 'bp_program_upload');
  });

  it('does not advertise status updates for another uploader document when no valid transition is allowed', async () => {
    jest
      .spyOn(stepScope, 'resolveWorkstepScopesOrEmpty')
      .mockResolvedValue(new Map([[MaToolWorkstepType.RECON_DATA, { own: false }]]) as any);
    jest
      .spyOn(stepScope, 'hasProgramCapability')
      .mockImplementation(async (_u, _p, code) => code === 'bp_program_upload');
    docRepo.createQueryBuilder = jest.fn().mockImplementation(() => {
      const qb = makeQueryBuilder();
      qb.getOne = jest.fn().mockResolvedValue(otherReconDoc());
      return qb;
    });

    const out = await service.findOne(2, { isAdmin: false }, USER_ID);

    expect(out.isCanUpdateStatus).toBe(false);
  });

  it('does not advertise status updates after the program leaves in-progress state', async () => {
    jest
      .spyOn(stepScope, 'resolveWorkstepScopesOrEmpty')
      .mockResolvedValue(new Map([[MaToolWorkstepType.RECON_DATA, { own: false }]]) as any);
    jest.spyOn(stepScope, 'hasProgramCapability').mockResolvedValue(true);
    docRepo.createQueryBuilder = jest.fn().mockImplementation(() => {
      const qb = makeQueryBuilder();
      qb.getOne = jest.fn().mockResolvedValue(
        ownReconDoc({
          program: { progress_status: BiPaymentProgressStatus.COMPLETED },
        }),
      );
      return qb;
    });

    const out = await service.findOne(1, { isAdmin: false }, USER_ID);

    expect(out.isCanUpdateStatus).toBe(false);
  });
});
