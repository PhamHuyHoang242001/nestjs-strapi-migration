import 'reflect-metadata';
import { PERMISSION_META_KEY } from '@common/authorization/constants/authorization.constant';
import { DATA_ACCESS_META_KEY } from '@common/authorization/constants/authorization.constant';
import { SkillPackageController } from '../skill-package.controller';

// Controller perm mapping — verify write routes carry correct codes and view routes
// carry no DataAccess metadata (M6: no DataAccessInterceptor on skill routes).
describe('SkillPackageController — perm mapping', () => {
  const getPerm = (prop: string): string[] | undefined =>
    Reflect.getMetadata(PERMISSION_META_KEY, SkillPackageController.prototype[prop]);

  const getDataAccess = (prop: string): unknown =>
    Reflect.getMetadata(DATA_ACCESS_META_KEY, SkillPackageController.prototype[prop]);

  it('createItem carries skill_upload', () => {
    expect(getPerm('createItem')).toEqual(['skill_upload']);
  });

  it('createVersion carries skill_upload', () => {
    expect(getPerm('createVersion')).toEqual(['skill_upload']);
  });

  it('approveVersion carries skill_approve', () => {
    expect(getPerm('approveVersion')).toEqual(['skill_approve']);
  });

  it('rejectVersion carries skill_approve', () => {
    expect(getPerm('rejectVersion')).toEqual(['skill_approve']);
  });

  it('toggleStatus carries skill_approve', () => {
    expect(getPerm('toggleStatus')).toEqual(['skill_approve']);
  });

  // BearerGuard-only routes must NOT have @RequirePermission (no guard code).
  it('listItems has no RequirePermission metadata (auth-only)', () => {
    expect(getPerm('listItems')).toBeUndefined();
  });

  // Workspace counters moved to GET /v1/asset-hub/stats — this controller no longer serves them.
  it('no longer registers a stats route', () => {
    expect((SkillPackageController.prototype as unknown as Record<string, unknown>).stats).toBeUndefined();
  });

  it('getItem has no RequirePermission metadata', () => {
    expect(getPerm('getItem')).toBeUndefined();
  });

  it('listReviews carries skill_approve', () => {
    expect(getPerm('listReviews')).toEqual(['skill_approve']);
  });

  it('listReviewSubmitters carries skill_approve', () => {
    expect(getPerm('listReviewSubmitters')).toEqual(['skill_approve']);
  });

  it('getDiff has no RequirePermission metadata (service-layer authz only)', () => {
    expect(getPerm('getDiff')).toBeUndefined();
  });

  it('getVersion has no RequirePermission metadata (service-layer authz only)', () => {
    expect(getPerm('getVersion')).toBeUndefined();
  });

  it('myPermissions has no RequirePermission metadata', () => {
    expect(getPerm('myPermissions')).toBeUndefined();
  });

  // M6: verify no DataAccess metadata on any skill route.
  const allMethods = [
    'listItems',
    'getItem',
    'listReviews',
    'listReviewSubmitters',
    'getVersion',
    'getDiff',
    'myPermissions',
    'createItem',
    'createVersion',
    'approveVersion',
    'rejectVersion',
    'toggleStatus',
  ];

  it.each(allMethods)('%s has no DataAccess metadata (M6 — no owner-scope on skill routes)', (method) => {
    expect(getDataAccess(method)).toBeUndefined();
  });
});
