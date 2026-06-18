import { ForbiddenException, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserType } from '@modules/databases/user.entity';
import { OwnerScopeGuard } from '../guards/owner-scope.guard';
import { OwnerScopeResolverService } from '../services/owner-scope-resolver.service';

describe('OwnerScopeGuard', () => {
  const reflector = { getAllAndOverride: jest.fn() };
  const ownerScope = {
    isInOwnedScope: jest.fn(),
    getUserOwnerScope: jest.fn(),
  };
  let guard: OwnerScopeGuard;

  const context = (info: Record<string, unknown>, body: any = {}, params: any = {}): ExecutionContext =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({ getRequest: () => ({ info, body, params }) }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new OwnerScopeGuard(reflector as unknown as Reflector, ownerScope as unknown as OwnerScopeResolverService);
  });

  it('passes through when no @RequireOwnerScope meta is set', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    await expect(guard.canActivate(context({ user: { id: 1 }, client: 'user' }))).resolves.toBe(true);
    expect(ownerScope.isInOwnedScope).not.toHaveBeenCalled();
  });

  it('super_admin without verbFromExplicit flag still triggers ownership fallback', async () => {
    // Edge case: super_admin reached OwnerScopeGuard but PermissionGuard never ran
    // (endpoint missing @RequirePermission). Flag undefined → fall back to owned check.
    reflector.getAllAndOverride.mockReturnValue({
      table: 'bi_hub_bicc_departments',
      scopeFromBody: 'bicc_department_id',
    });
    ownerScope.isInOwnedScope.mockResolvedValue(false);

    await expect(
      guard.canActivate(
        context({ user: { id: 1, type: UserType.SUPER_ADMIN }, client: 'user' }, { bicc_department_id: 2 }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(ownerScope.isInOwnedScope).toHaveBeenCalledWith(1, 'bi_hub_bicc_departments', 2);
  });

  it('bypasses ownership check when verbFromExplicit=true (Option B)', async () => {
    reflector.getAllAndOverride.mockReturnValue({ table: 'bi_hub_diagnostic_reports', scopeFromParam: 'id' });

    await expect(
      guard.canActivate(context({ user: { id: 1 }, client: 'user', verbFromExplicit: true }, {}, { id: '999' })),
    ).resolves.toBe(true);
    expect(ownerScope.isInOwnedScope).not.toHaveBeenCalled();
  });

  it('super_admin chain: PermissionGuard set flag=true → OwnerScopeGuard bypass', async () => {
    reflector.getAllAndOverride.mockReturnValue({
      table: 'bi_hub_bicc_departments',
      scopeFromBody: 'bicc_department_id',
    });

    await expect(
      guard.canActivate(
        context(
          { user: { id: 1, type: UserType.SUPER_ADMIN }, client: 'user', verbFromExplicit: true },
          { bicc_department_id: 999 },
        ),
      ),
    ).resolves.toBe(true);
    expect(ownerScope.isInOwnedScope).not.toHaveBeenCalled();
  });

  it('still checks ownership when verbFromExplicit=false (pure SO path)', async () => {
    reflector.getAllAndOverride.mockReturnValue({ table: 'bi_hub_diagnostic_reports', scopeFromParam: 'id' });
    ownerScope.isInOwnedScope.mockResolvedValue(false);

    await expect(
      guard.canActivate(context({ user: { id: 1 }, client: 'user', verbFromExplicit: false }, {}, { id: '999' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows when verbFromExplicit=false and target IS in owned scope', async () => {
    reflector.getAllAndOverride.mockReturnValue({ table: 'bi_hub_diagnostic_reports', scopeFromParam: 'id' });
    ownerScope.isInOwnedScope.mockResolvedValue(true);

    await expect(
      guard.canActivate(context({ user: { id: 1 }, client: 'user', verbFromExplicit: false }, {}, { id: '999' })),
    ).resolves.toBe(true);
  });

  it('falls back to ownership when verbFromExplicit is undefined (no @RequirePermission)', async () => {
    reflector.getAllAndOverride.mockReturnValue({ table: 'bi_hub_diagnostic_reports', scopeFromParam: 'id' });
    ownerScope.isInOwnedScope.mockResolvedValue(false);

    await expect(
      guard.canActivate(context({ user: { id: 1 }, client: 'user' }, {}, { id: '999' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(ownerScope.isInOwnedScope).toHaveBeenCalled();
  });

  it('throws when target id is missing from body', async () => {
    reflector.getAllAndOverride.mockReturnValue({
      table: 'bi_hub_bicc_departments',
      scopeFromBody: 'bicc_department_id',
    });
    await expect(guard.canActivate(context({ user: { id: 1 }, client: 'user' }, {}))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('allows when scopeFromBody target is in owned scope', async () => {
    reflector.getAllAndOverride.mockReturnValue({
      table: 'bi_hub_bicc_departments',
      scopeFromBody: 'bicc_department_id',
    });
    ownerScope.isInOwnedScope.mockResolvedValue(true);

    await expect(
      guard.canActivate(context({ user: { id: 1 }, client: 'user' }, { bicc_department_id: 1 })),
    ).resolves.toBe(true);
    expect(ownerScope.isInOwnedScope).toHaveBeenCalledWith(1, 'bi_hub_bicc_departments', 1);
  });

  it('rejects when scopeFromBody target is NOT in owned scope', async () => {
    reflector.getAllAndOverride.mockReturnValue({
      table: 'bi_hub_bicc_departments',
      scopeFromBody: 'bicc_department_id',
    });
    ownerScope.isInOwnedScope.mockResolvedValue(false);

    await expect(
      guard.canActivate(context({ user: { id: 1 }, client: 'user' }, { bicc_department_id: 2 })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows when scopeFromParam id is in owned scope', async () => {
    reflector.getAllAndOverride.mockReturnValue({ table: 'bi_hub_diagnostic_reports', scopeFromParam: 'id' });
    ownerScope.isInOwnedScope.mockResolvedValue(true);

    await expect(guard.canActivate(context({ user: { id: 1 }, client: 'user' }, {}, { id: '999' }))).resolves.toBe(
      true,
    );
    expect(ownerScope.isInOwnedScope).toHaveBeenCalledWith(1, 'bi_hub_diagnostic_reports', 999);
  });

  it('rejects when scopeFromParam id is NOT in owned scope', async () => {
    reflector.getAllAndOverride.mockReturnValue({ table: 'bi_hub_diagnostic_reports', scopeFromParam: 'id' });
    ownerScope.isInOwnedScope.mockResolvedValue(false);

    await expect(
      guard.canActivate(context({ user: { id: 1 }, client: 'user' }, {}, { id: '999' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws when neither scopeFromBody nor scopeFromParam is configured', async () => {
    reflector.getAllAndOverride.mockReturnValue({ table: 'bi_hub_bicc_departments' });

    await expect(guard.canActivate(context({ user: { id: 1 }, client: 'user' }))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects unauthenticated request', async () => {
    reflector.getAllAndOverride.mockReturnValue({
      table: 'bi_hub_bicc_departments',
      scopeFromBody: 'bicc_department_id',
    });
    await expect(guard.canActivate(context({ client: 'user' }, { bicc_department_id: 1 }))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
