/**
 * Diagnostic-report create parent-scope integration.
 *
 * Composes the real PermissionCacheService + OwnerScopeResolverService + the actual
 * BiHubDiagnosticReportWriteService.create() gate (DB-mocked for unit speed) to prove the
 * role↔bicc binding genuinely gates create through the production code path:
 *
 *   bound-role allow   — parent in getAccessibleRecords(verb) → create proceeds
 *   unbound-role 403   — parent NOT bound + no SO → ForbiddenException, no write
 *   SO-owner allow     — parent in owned subtree → create proceeds
 *   super_admin allow  — gate bypassed entirely
 */

import { ForbiddenException } from '@nestjs/common';
import { RedisAdapter } from '@common/infrastructure/redis.adapter';
import { OwnerScopeResolverService } from '@common/authorization/services/owner-scope-resolver.service';
import { PermissionCacheService } from '@common/authorization/services/permission-cache.service';
import { BiHubDiagnosticReportWriteService } from './bi-hub-diagnostic-report-write.service';
import type { CreateDiagnosticReportDto } from './dto';

jest.mock('@common/infrastructure/redis.adapter');

const USER = 100;
const DEPT_A = 1; // bound to user's role for bh_diag_report_create
const DEPT_B = 2; // not bound

describe('Diagnostic create parent-scope integration', () => {
  const dsQuery = jest.fn(); // backs OwnerScopeResolverService (owner-scope + walk-up SQL)
  const queryService = {
    getUserPermissions: jest.fn(),
    getAccessibleRecords: jest.fn(),
    getUserIdsByRole: jest.fn(),
  };
  const transaction = jest.fn();
  const readService = { reportRepo: {} } as any;
  const creatorAccessGrant = { grantCreatorAccess: jest.fn(), invalidateUserCache: jest.fn() } as any;

  let permissionCache: PermissionCacheService;
  let ownerScope: OwnerScopeResolverService;
  let service: BiHubDiagnosticReportWriteService;

  const dto = (biccDepartment: number) =>
    ({ biccDepartment, name: 'r', icon: 'i', isSensitive: false, scopes: 's' }) as CreateDiagnosticReportDto;

  beforeEach(() => {
    jest.clearAllMocks();
    dsQuery.mockReset();
    (RedisAdapter.get as jest.Mock).mockResolvedValue(null);
    (RedisAdapter.set as jest.Mock).mockResolvedValue(undefined);
    (RedisAdapter.unlinkKeyByPattern as jest.Mock).mockResolvedValue([]);
    transaction.mockResolvedValue({ id: 1 });

    permissionCache = new PermissionCacheService(queryService as any);
    ownerScope = new OwnerScopeResolverService({ query: dsQuery } as any, permissionCache);
    service = new BiHubDiagnosticReportWriteService(
      readService,
      { transaction } as any,
      creatorAccessGrant,
      ownerScope,
    );
  });

  it('bound-role: parent bound to a role holding the create verb → create proceeds', async () => {
    queryService.getAccessibleRecords.mockResolvedValue([DEPT_A]);

    const result = await service.create(dto(DEPT_A), USER, false);

    expect(result).toEqual({ id: 1 });
    expect(queryService.getAccessibleRecords).toHaveBeenCalledWith(
      USER,
      'bi_hub_bicc_departments',
      'bh_diag_report_create',
    );
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('unbound-role: parent not bound and no SO → ForbiddenException, no write', async () => {
    queryService.getAccessibleRecords.mockResolvedValue([DEPT_A]); // DEPT_B not in set
    dsQuery.mockResolvedValueOnce([]); // owner scope empty → isInOwnedScope short-circuits false

    await expect(service.create(dto(DEPT_B), USER, false)).rejects.toBeInstanceOf(ForbiddenException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('SO-owner: parent in owned subtree (no explicit binding) → create proceeds', async () => {
    queryService.getAccessibleRecords.mockResolvedValue([]); // explicit miss
    dsQuery
      .mockResolvedValueOnce([{ resource_type: 'bicc_department', resource_id: DEPT_B, role_id: 7 }]) // owner scope
      .mockResolvedValueOnce([{ exists: 1 }]); // walk-up: DEPT_B is owned root

    const result = await service.create(dto(DEPT_B), USER, false);

    expect(result).toEqual({ id: 1 });
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('super_admin: gate bypassed entirely → create proceeds without scope lookups', async () => {
    const result = await service.create(dto(DEPT_B), USER, true);

    expect(result).toEqual({ id: 1 });
    expect(queryService.getAccessibleRecords).not.toHaveBeenCalled();
    expect(dsQuery).not.toHaveBeenCalled();
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
