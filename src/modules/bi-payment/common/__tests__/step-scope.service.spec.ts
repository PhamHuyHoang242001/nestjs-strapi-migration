import { ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RedisAdapter } from '@common/infrastructure/redis.adapter';
import { OwnerScopeResolverService } from '@common/authorization/services/owner-scope-resolver.service';
import { PermissionCacheService } from '@common/authorization/services/permission-cache.service';
import { MaToolWorkstepType } from '@common/enums/ma-tool.enums';
import { ALL_WORKSTEP_TYPES, PROGRAM_CONTENT_VIEW_CODE, WORKSTEP_VIEW_CODES } from '../step-scope.constants';
import { StepScopeService } from '../step-scope.service';

jest.mock('@common/infrastructure/redis.adapter');

const PROGRAM_ID = 5;
const USER_ID = 100;

// The current view model queries one code per view-grant bucket.
const distinctCodes = [...new Set(Object.values(WORKSTEP_VIEW_CODES).flat())];

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

  // Non-SO with upload at the program → every workstep.
  it('non-SO with bp_program_upload at program → all worksteps', async () => {
    dsQuery.mockResolvedValueOnce([{ resource_type: 'bicc_department', resource_id: 1, role_id: 7 }]); // owner scope (no walk-up match queued → empty)
    dsQuery.mockResolvedValueOnce([]); // isInOwnedScope walk-up returns no match → false

    queryService.getAccessibleRecords.mockImplementation((_uid, _table, code) =>
      Promise.resolve(code === 'bp_program_upload' ? [PROGRAM_ID] : []),
    );

    const allowed = await service.resolveAllowedWorksteps(USER_ID, PROGRAM_ID);

    expect(allowed.size).toBe(ALL_WORKSTEP_TYPES.length);
    for (const ws of ALL_WORKSTEP_TYPES) expect(allowed.has(ws)).toBe(true);
  });

  // Non-SO with no code at the program → ForbiddenException.
  it('non-SO with no step code at program → throws ForbiddenException', async () => {
    dsQuery.mockResolvedValueOnce([{ resource_type: 'bicc_department', resource_id: 1, role_id: 7 }]);
    dsQuery.mockResolvedValueOnce([]); // isInOwnedScope false

    queryService.getAccessibleRecords.mockResolvedValue([]);

    await expect(service.resolveAllowedWorksteps(USER_ID, PROGRAM_ID)).rejects.toBeInstanceOf(ForbiddenException);
  });

  // recon upload at program → {recon_data} only.
  it('non-SO with bp_program_upload_recon at program → {recon_data}', async () => {
    dsQuery.mockResolvedValueOnce([{ resource_type: 'bicc_department', resource_id: 1, role_id: 7 }]);
    dsQuery.mockResolvedValueOnce([]);
    queryService.getAccessibleRecords.mockImplementation((_uid, _table, code) =>
      Promise.resolve(code === 'bp_program_upload_recon' ? [PROGRAM_ID] : []),
    );

    const allowed = await service.resolveAllowedWorksteps(USER_ID, PROGRAM_ID);
    expect([...allowed]).toEqual([MaToolWorkstepType.RECON_DATA]);
  });

  // approve at program → {prepare, ex_prepare}.
  it('non-SO with bp_program_approve at program → {prepare, ex_prepare}', async () => {
    dsQuery.mockResolvedValueOnce([{ resource_type: 'bicc_department', resource_id: 1, role_id: 7 }]);
    dsQuery.mockResolvedValueOnce([]);
    queryService.getAccessibleRecords.mockImplementation((_uid, _table, code) =>
      Promise.resolve(code === 'bp_program_approve' ? [PROGRAM_ID] : []),
    );

    const allowed = await service.resolveAllowedWorksteps(USER_ID, PROGRAM_ID);
    expect(allowed.has(MaToolWorkstepType.PREPARE)).toBe(true);
    expect(allowed.has(MaToolWorkstepType.EX_PREPARE)).toBe(true);
    expect(allowed.has(MaToolWorkstepType.RECON_DATA)).toBe(false);
    expect(allowed.has(MaToolWorkstepType.RECON_FEEDBACK)).toBe(false);
  });

  // Upload recon stays own-only and does NOT unlock feedback.
  it('upload_recon code does NOT unlock recon_feedback', async () => {
    dsQuery.mockResolvedValueOnce([{ resource_type: 'bicc_department', resource_id: 1, role_id: 7 }]);
    dsQuery.mockResolvedValueOnce([]);
    queryService.getAccessibleRecords.mockImplementation((_uid, _table, code) =>
      Promise.resolve(code === 'bp_program_upload_recon' ? [PROGRAM_ID] : []),
    );

    const allowed = await service.resolveAllowedWorksteps(USER_ID, PROGRAM_ID);
    expect(allowed.has(MaToolWorkstepType.RECON_DATA)).toBe(true);
    expect(allowed.has(MaToolWorkstepType.RECON_FEEDBACK)).toBe(false);
  });

  // assertWorkstep respects own-only recon scope.
  it('assertWorkstep respects own-only recon scope', async () => {
    dsQuery.mockResolvedValue([{ resource_type: 'bicc_department', resource_id: 1, role_id: 7 }]);
    dsQuery.mockResolvedValueOnce([]); // isInOwnedScope false (first call)
    dsQuery.mockResolvedValueOnce([]); // isInOwnedScope false (second call, assertWorkstep re-resolves)
    queryService.getAccessibleRecords.mockImplementation((_uid, _table, code) =>
      Promise.resolve(code === 'bp_program_upload_recon' ? [PROGRAM_ID] : []),
    );

    await expect(service.assertWorkstep(USER_ID, PROGRAM_ID, MaToolWorkstepType.RECON_DATA)).resolves.toBeUndefined();
    await expect(service.assertWorkstep(USER_ID, PROGRAM_ID, MaToolWorkstepType.PREPARE)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
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
  // Grant only the workstep view codes (not the full-content short-circuit code)
  // so the per-code loop runs and every distinct code is queried.
  it('queries getAccessibleRecords once per distinct code', async () => {
    dsQuery.mockResolvedValueOnce([{ resource_type: 'bicc_department', resource_id: 1, role_id: 7 }]);
    dsQuery.mockResolvedValueOnce([]);
    queryService.getAccessibleRecords.mockImplementation((_uid, _table, code) =>
      Promise.resolve(distinctCodes.includes(code) ? [PROGRAM_ID] : []),
    );

    await service.resolveAllowedWorksteps(USER_ID, PROGRAM_ID);

    const codesCalled = queryService.getAccessibleRecords.mock.calls.map((c) => c[2]);
    // Full-content code is probed up-front, then the distinct workstep codes.
    expect(new Set(codesCalled)).toEqual(new Set([PROGRAM_CONTENT_VIEW_CODE, ...distinctCodes]));
  });

  // ── 8-permission model: resolveWorkstepScopes (own-aware) ──────────────────
  describe('resolveWorkstepScopes (8-permission model)', () => {
    // Grant a code only at PROGRAM_ID; every other code resolves to no records.
    const grantCodes = (...codes: string[]) =>
      queryService.getAccessibleRecords.mockImplementation((_uid, _table, code) =>
        Promise.resolve(codes.includes(code) ? [PROGRAM_ID] : []),
      );

    it('SO owner → all worksteps, own:false; skips getAccessibleRecords', async () => {
      jest.spyOn(ownerScope, 'isInOwnedScope').mockResolvedValue(true);

      const scopes = await service.resolveWorkstepScopes(USER_ID, PROGRAM_ID);

      expect(scopes.size).toBe(ALL_WORKSTEP_TYPES.length);
      for (const ws of ALL_WORKSTEP_TYPES) expect(scopes.get(ws)).toEqual({ own: false });
      expect(queryService.getAccessibleRecords).not.toHaveBeenCalled();
    });

    it('bp_program_upload (full) → every workstep, own:false', async () => {
      jest.spyOn(ownerScope, 'isInOwnedScope').mockResolvedValue(false);
      grantCodes('bp_program_upload');

      const scopes = await service.resolveWorkstepScopes(USER_ID, PROGRAM_ID);

      for (const ws of ALL_WORKSTEP_TYPES) expect(scopes.get(ws)).toEqual({ own: false });
    });

    it('bp_program_content_view → every workstep, own:false (read-only full)', async () => {
      jest.spyOn(ownerScope, 'isInOwnedScope').mockResolvedValue(false);
      grantCodes(PROGRAM_CONTENT_VIEW_CODE);

      const scopes = await service.resolveWorkstepScopes(USER_ID, PROGRAM_ID);

      expect(scopes.size).toBe(ALL_WORKSTEP_TYPES.length);
      for (const ws of ALL_WORKSTEP_TYPES) expect(scopes.get(ws)).toEqual({ own: false });
    });

    it('bp_program_content_view at another program only → no view at this program', async () => {
      jest.spyOn(ownerScope, 'isInOwnedScope').mockResolvedValue(false);
      // content_view granted, but resolves to a different program id → no records here.
      queryService.getAccessibleRecords.mockImplementation((_uid, _table, code) =>
        Promise.resolve(code === PROGRAM_CONTENT_VIEW_CODE ? [PROGRAM_ID + 1] : []),
      );

      const scopes = await service.resolveWorkstepScopes(USER_ID, PROGRAM_ID);

      expect(scopes.size).toBe(0);
    });

    it('bp_program_upload_recon → only RECON_DATA, own:true', async () => {
      jest.spyOn(ownerScope, 'isInOwnedScope').mockResolvedValue(false);
      grantCodes('bp_program_upload_recon');

      const scopes = await service.resolveWorkstepScopes(USER_ID, PROGRAM_ID);

      expect([...scopes.keys()]).toEqual([MaToolWorkstepType.RECON_DATA]);
      expect(scopes.get(MaToolWorkstepType.RECON_DATA)).toEqual({ own: true });
    });

    it('bp_program_approve → PREPARE + EX_PREPARE, own:false; no recon', async () => {
      jest.spyOn(ownerScope, 'isInOwnedScope').mockResolvedValue(false);
      grantCodes('bp_program_approve');

      const scopes = await service.resolveWorkstepScopes(USER_ID, PROGRAM_ID);

      expect(scopes.get(MaToolWorkstepType.PREPARE)).toEqual({ own: false });
      expect(scopes.get(MaToolWorkstepType.EX_PREPARE)).toEqual({ own: false });
      expect(scopes.has(MaToolWorkstepType.RECON_DATA)).toBe(false);
      expect(scopes.has(MaToolWorkstepType.RECON_FEEDBACK)).toBe(false);
    });

    it('bp_program_confirm → grants no document view (empty map)', async () => {
      jest.spyOn(ownerScope, 'isInOwnedScope').mockResolvedValue(false);
      grantCodes('bp_program_confirm');

      const scopes = await service.resolveWorkstepScopes(USER_ID, PROGRAM_ID);

      expect(scopes.size).toBe(0);
    });

    it('upload + upload_recon on RECON_DATA → full-view wins (own:false)', async () => {
      jest.spyOn(ownerScope, 'isInOwnedScope').mockResolvedValue(false);
      grantCodes('bp_program_upload', 'bp_program_upload_recon');

      const scopes = await service.resolveWorkstepScopes(USER_ID, PROGRAM_ID);

      expect(scopes.get(MaToolWorkstepType.RECON_DATA)).toEqual({ own: false });
    });

    it('no view code at program → empty map, does NOT throw', async () => {
      jest.spyOn(ownerScope, 'isInOwnedScope').mockResolvedValue(false);
      grantCodes(); // nothing granted

      const scopes = await service.resolveWorkstepScopes(USER_ID, PROGRAM_ID);

      expect(scopes.size).toBe(0);
    });

    // Red-team L: SO of program A must NOT get own-all at program B.
    it('SO-of-A + upload_recon-on-B: at B → RECON_DATA own:true (not own-all)', async () => {
      // isInOwnedScope is asked about THIS program (B) → false; only upload_recon holds.
      jest.spyOn(ownerScope, 'isInOwnedScope').mockResolvedValue(false);
      grantCodes('bp_program_upload_recon');

      const scopes = await service.resolveWorkstepScopes(USER_ID, PROGRAM_ID);

      expect([...scopes.keys()]).toEqual([MaToolWorkstepType.RECON_DATA]);
      expect(scopes.get(MaToolWorkstepType.RECON_DATA)).toEqual({ own: true });
    });

    it('upload on A + upload_recon on B keeps B own:true and does not widen from A', async () => {
      jest.spyOn(ownerScope, 'isInOwnedScope').mockResolvedValue(false);
      queryService.getAccessibleRecords.mockImplementation((_uid, _table, code) => {
        if (code === 'bp_program_upload') return Promise.resolve([PROGRAM_ID + 1]);
        if (code === 'bp_program_upload_recon') return Promise.resolve([PROGRAM_ID]);
        return Promise.resolve([]);
      });

      const scopes = await service.resolveWorkstepScopes(USER_ID, PROGRAM_ID);

      expect([...scopes.keys()]).toEqual([MaToolWorkstepType.RECON_DATA]);
      expect(scopes.get(MaToolWorkstepType.RECON_DATA)).toEqual({ own: true });
    });
  });

  // ── 8-permission model: resolveGlobalWorkstepScopes (cross-program) ────────
  describe('resolveGlobalWorkstepScopes (cross-program own-aware)', () => {
    it('upload_recon globally → RECON_DATA own:true only', async () => {
      queryService.getUserPermissions.mockResolvedValue(['bp_program_upload_recon']);

      const scopes = await service.resolveGlobalWorkstepScopes(USER_ID);

      expect([...scopes.keys()]).toEqual([MaToolWorkstepType.RECON_DATA]);
      expect(scopes.get(MaToolWorkstepType.RECON_DATA)).toEqual({ own: true });
    });

    it('upload globally → all worksteps own:false', async () => {
      queryService.getUserPermissions.mockResolvedValue(['bp_program_upload']);

      const scopes = await service.resolveGlobalWorkstepScopes(USER_ID);

      for (const ws of ALL_WORKSTEP_TYPES) expect(scopes.get(ws)).toEqual({ own: false });
    });

    it('content_view globally → all worksteps own:false (read-only full)', async () => {
      queryService.getUserPermissions.mockResolvedValue([PROGRAM_CONTENT_VIEW_CODE]);

      const scopes = await service.resolveGlobalWorkstepScopes(USER_ID);

      expect(scopes.size).toBe(ALL_WORKSTEP_TYPES.length);
      for (const ws of ALL_WORKSTEP_TYPES) expect(scopes.get(ws)).toEqual({ own: false });
    });
  });
});
