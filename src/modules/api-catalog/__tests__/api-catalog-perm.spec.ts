import 'reflect-metadata';
import { PERMISSION_META_KEY } from '@common/authorization/constants/authorization.constant';
import { DATA_ACCESS_META_KEY } from '@common/authorization/constants/authorization.constant';
import { ApiCatalogController } from '../api-catalog.controller';

// Controller perm mapping — verify write routes carry correct codes and view routes
// carry no DataAccess metadata (no DataAccessInterceptor on prompt routes).
describe('ApiCatalogController — perm mapping', () => {
  const getPerm = (prop: string): string[] | undefined =>
    Reflect.getMetadata(PERMISSION_META_KEY, ApiCatalogController.prototype[prop]);

  const getDataAccess = (prop: string): unknown =>
    Reflect.getMetadata(DATA_ACCESS_META_KEY, ApiCatalogController.prototype[prop]);

  it('createItem carries api_upload', () => {
    expect(getPerm('createItem')).toEqual(['api_upload']);
  });

  it('createVersion carries api_upload', () => {
    expect(getPerm('createVersion')).toEqual(['api_upload']);
  });

  it('approveVersion carries api_approve', () => {
    expect(getPerm('approveVersion')).toEqual(['api_approve']);
  });

  it('rejectVersion carries api_approve', () => {
    expect(getPerm('rejectVersion')).toEqual(['api_approve']);
  });

  it('toggleStatus carries api_approve', () => {
    expect(getPerm('toggleStatus')).toEqual(['api_approve']);
  });

  // BearerGuard-only routes must NOT have @RequirePermission (no guard code).
  it('listItems has no RequirePermission metadata (auth-only)', () => {
    expect(getPerm('listItems')).toBeUndefined();
  });

  // Workspace counters moved to GET /v1/asset-hub/stats — this controller no longer serves them.
  it('no longer registers a stats route', () => {
    expect((ApiCatalogController.prototype as unknown as Record<string, unknown>).stats).toBeUndefined();
  });

  it('does not register a download route', () => {
    expect((ApiCatalogController.prototype as unknown as Record<string, unknown>).downloadMarkdown).toBeUndefined();
  });

  it('getItem has no RequirePermission metadata', () => {
    expect(getPerm('getItem')).toBeUndefined();
  });

  it('listReviews carries api_approve', () => {
    expect(getPerm('listReviews')).toEqual(['api_approve']);
  });

  it('listReviewSubmitters carries api_approve', () => {
    expect(getPerm('listReviewSubmitters')).toEqual(['api_approve']);
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

  // Verify no DataAccess metadata on any prompt route (no owner-scope on prompt routes).
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

  it.each(allMethods)('%s has no DataAccess metadata (no owner-scope on prompt routes)', (method) => {
    expect(getDataAccess(method)).toBeUndefined();
  });
});
