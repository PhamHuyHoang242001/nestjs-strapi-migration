import { ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RedisAdapter } from '@common/infrastructure/redis.adapter';
import { OwnerScopeResolverService } from '@common/authorization/services/owner-scope-resolver.service';
import { PermissionCacheService } from '@common/authorization/services/permission-cache.service';
import { MaToolWorkstepType } from '@common/enums/ma-tool.enums';
import { ALL_WORKSTEP_TYPES, WORKSTEP_TYPE_PERM } from '../step-scope.constants';
import { StepScopeService } from '../step-scope.service';

jest.mock('@common/infrastructure/redis.adapter');

const PROGRAM_ID = 5;
const USER_ID = 100;

// Each distinct workstep_type maps to one of three codes (prepare + ex_prepare
// share bp_program_preparing), so resolveAllowedWorksteps issues up to 4
// getAccessibleRecords calls — one per entry in WORKSTEP_TYPE_PERM.
const distinctCodes = [...new Set(Object.values(WORKSTEP_TYPE_PERM))];

describe('StepScopeService', () => {
  const queryService = {
    getUserPermissions: jest.fn(),
    getAccessibleRecords: jest.fn(),
    getUserIdsByRole: jest.fn(),
  };
  const dsQuery = jest.fn();
  const ds = { query: dsQuery } as unknown as DataSource;
  let permissionCache: PermissionCacheService;
  let ownerScope: OwnerScopeResolverService;
  let service: StepScopeService;

  beforeEach(() => {
    jest.clearAllMocks();
    (RedisAdapter.get as jest.Mock).mockResolvedValue(null);
    (RedisAdapter.set as jest.Mock).mockResolvedValue(undefined);
    (RedisAdapter.unlinkKeyByPattern as jest.Mock).mockResolvedValue([]);
    dsQuery.mockReset();

    permissionCache = new PermissionCacheService(queryService as any);
    ownerScope = new OwnerScopeResolverService(ds, permissionCache);
    service = new StepScopeService(permissionCache, ownerScope);
  });

  // SO owner: isInOwnedScope returns true → all worksteps, NO getAccessibleRecords calls.
  it('SO owner → allowed = ALL workstep types; does not query getAccessibleRecords', async () => {
    // owner scope row + walk-up chain match
    dsQuery
      .mockResolvedValueOnce([{ resource_type: 'bicc_department', resource_id: 1, role_id: 7 }])
      .mockResolvedValueOnce([{ exists: 1 }]); // isInOwnedScope walk-up

    const allowed = await service.resolveAllowedWorksteps(USER_ID, PROGRAM_ID);

    expect(allowed.size).toBe(ALL_WORKSTEP_TYPES.length);
    for (const ws of ALL_WORKSTEP_TYPES) expect(allowed.has(ws)).toBe(true);
    expect(queryService.getAccessibleRecords).not.toHaveBeenCalled();
  });

  // Non-SO with bp_program_preparing at the program → {prepare, ex_prepare}.
  it('non-SO with bp_program_preparing at program → {prepare, ex_prepare}', async () => {
    dsQuery.mockResolvedValueOnce([{ resource_type: 'bicc_department', resource_id: 1, role_id: 7 }]); // owner scope (no walk-up match queued → empty)
    dsQuery.mockResolvedValueOnce([]); // isInOwnedScope walk-up returns no match → false

    queryService.getAccessibleRecords.mockImplementation((_uid, _table, code) =>
      Promise.resolve(code === 'bp_program_preparing' ? [PROGRAM_ID] : []),
    );

    const allowed = await service.resolveAllowedWorksteps(USER_ID, PROGRAM_ID);

    expect(allowed.has(MaToolWorkstepType.PREPARE)).toBe(true);
    expect(allowed.has(MaToolWorkstepType.EX_PREPARE)).toBe(true);
    expect(allowed.has(MaToolWorkstepType.RECON_DATA)).toBe(false);
    expect(allowed.has(MaToolWorkstepType.RECON_FEEDBACK)).toBe(false);
  });

  // Non-SO with no code at the program → ForbiddenException.
  it('non-SO with no step code at program → throws ForbiddenException', async () => {
    dsQuery.mockResolvedValueOnce([{ resource_type: 'bicc_department', resource_id: 1, role_id: 7 }]);
    dsQuery.mockResolvedValueOnce([]); // isInOwnedScope false

    queryService.getAccessibleRecords.mockResolvedValue([]);

    await expect(service.resolveAllowedWorksteps(USER_ID, PROGRAM_ID)).rejects.toBeInstanceOf(ForbiddenException);
  });

  // recon_data code at program → {recon_data} only.
  it('non-SO with bp_program_reconciliation_sale at program → {recon_data}', async () => {
    dsQuery.mockResolvedValueOnce([{ resource_type: 'bicc_department', resource_id: 1, role_id: 7 }]);
    dsQuery.mockResolvedValueOnce([]);
    queryService.getAccessibleRecords.mockImplementation((_uid, _table, code) =>
      Promise.resolve(code === 'bp_program_reconciliation_sale' ? [PROGRAM_ID] : []),
    );

    const allowed = await service.resolveAllowedWorksteps(USER_ID, PROGRAM_ID);
    expect([...allowed]).toEqual([MaToolWorkstepType.RECON_DATA]);
  });

  // bicc code at program → {recon_feedback, recon_data} (one-way view bonus).
  it('non-SO with bp_program_reconciliation_bicc at program → {recon_feedback, recon_data}', async () => {
    dsQuery.mockResolvedValueOnce([{ resource_type: 'bicc_department', resource_id: 1, role_id: 7 }]);
    dsQuery.mockResolvedValueOnce([]);
    queryService.getAccessibleRecords.mockImplementation((_uid, _table, code) =>
      Promise.resolve(code === 'bp_program_reconciliation_bicc' ? [PROGRAM_ID] : []),
    );

    const allowed = await service.resolveAllowedWorksteps(USER_ID, PROGRAM_ID);
    expect(allowed.has(MaToolWorkstepType.RECON_FEEDBACK)).toBe(true);
    expect(allowed.has(MaToolWorkstepType.RECON_DATA)).toBe(true); // bicc pulls in recon_data
    expect(allowed.has(MaToolWorkstepType.PREPARE)).toBe(false);
    expect(allowed.has(MaToolWorkstepType.EX_PREPARE)).toBe(false);
  });

  // Sale does NOT inherit bicc's recon_feedback (asymmetric bonus).
  it('sale code does NOT unlock recon_feedback', async () => {
    dsQuery.mockResolvedValueOnce([{ resource_type: 'bicc_department', resource_id: 1, role_id: 7 }]);
    dsQuery.mockResolvedValueOnce([]);
    queryService.getAccessibleRecords.mockImplementation((_uid, _table, code) =>
      Promise.resolve(code === 'bp_program_reconciliation_sale' ? [PROGRAM_ID] : []),
    );

    const allowed = await service.resolveAllowedWorksteps(USER_ID, PROGRAM_ID);
    expect(allowed.has(MaToolWorkstepType.RECON_DATA)).toBe(true);
    expect(allowed.has(MaToolWorkstepType.RECON_FEEDBACK)).toBe(false);
  });

  // assertWorkstep: outside allowed → throws; inside → resolves.
  it('assertWorkstep outside allowed → throws; inside → resolves', async () => {
    dsQuery.mockResolvedValue([{ resource_type: 'bicc_department', resource_id: 1, role_id: 7 }]);
    dsQuery.mockResolvedValueOnce([]); // isInOwnedScope false (first call)
    dsQuery.mockResolvedValueOnce([]); // isInOwnedScope false (second call, assertWorkstep re-resolves)
    queryService.getAccessibleRecords.mockImplementation((_uid, _table, code) =>
      Promise.resolve(code === 'bp_program_preparing' ? [PROGRAM_ID] : []),
    );

    await expect(service.assertWorkstep(USER_ID, PROGRAM_ID, MaToolWorkstepType.RECON_DATA)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.assertWorkstep(USER_ID, PROGRAM_ID, MaToolWorkstepType.PREPARE)).resolves.toBeUndefined();
  });

  // SO owner + assertWorkstep any → pass (own-all).
  it('SO owner + assertWorkstep any workstep → pass', async () => {
    dsQuery
      .mockResolvedValueOnce([{ resource_type: 'bicc_department', resource_id: 1, role_id: 7 }])
      .mockResolvedValueOnce([{ exists: 1 }]); // isInOwnedScope true

    await expect(
      service.assertWorkstep(USER_ID, PROGRAM_ID, MaToolWorkstepType.RECON_FEEDBACK),
    ).resolves.toBeUndefined();
  });

  // Cache key per-code: getAccessibleRecords called with each distinct code.
  it('queries getAccessibleRecords once per distinct code (prepare+ex_prepare share code)', async () => {
    dsQuery.mockResolvedValueOnce([{ resource_type: 'bicc_department', resource_id: 1, role_id: 7 }]);
    dsQuery.mockResolvedValueOnce([]);
    queryService.getAccessibleRecords.mockResolvedValue([PROGRAM_ID]);

    await service.resolveAllowedWorksteps(USER_ID, PROGRAM_ID);

    // WORKSTEP_TYPE_PERM has 4 entries but 3 distinct codes.
    const codesCalled = queryService.getAccessibleRecords.mock.calls.map((c) => c[2]);
    expect(new Set(codesCalled)).toEqual(new Set(distinctCodes));
  });
});
