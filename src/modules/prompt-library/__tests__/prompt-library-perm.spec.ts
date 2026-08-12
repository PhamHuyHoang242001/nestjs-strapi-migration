import 'reflect-metadata';
import { PERMISSION_META_KEY } from '@common/authorization/constants/authorization.constant';
import { DATA_ACCESS_META_KEY } from '@common/authorization/constants/authorization.constant';
import { PromptLibraryController } from '../prompt-library.controller';

// Controller perm mapping — verify write routes carry correct codes and view routes
// carry no DataAccess metadata (no DataAccessInterceptor on prompt routes).
describe('PromptLibraryController — perm mapping', () => {
  const getPerm = (prop: string): string[] | undefined =>
    Reflect.getMetadata(PERMISSION_META_KEY, PromptLibraryController.prototype[prop]);

  const getDataAccess = (prop: string): unknown =>
    Reflect.getMetadata(DATA_ACCESS_META_KEY, PromptLibraryController.prototype[prop]);

  it('createItem carries prompt_upload', () => {
    expect(getPerm('createItem')).toEqual(['prompt_upload']);
  });

  it('createVersion carries prompt_upload', () => {
    expect(getPerm('createVersion')).toEqual(['prompt_upload']);
  });

  it('approveVersion carries prompt_approve', () => {
    expect(getPerm('approveVersion')).toEqual(['prompt_approve']);
  });

  it('rejectVersion carries prompt_approve', () => {
    expect(getPerm('rejectVersion')).toEqual(['prompt_approve']);
  });

  it('toggleStatus carries prompt_approve', () => {
    expect(getPerm('toggleStatus')).toEqual(['prompt_approve']);
  });

  // BearerGuard-only routes must NOT have @RequirePermission (no guard code).
  it('listItems has no RequirePermission metadata (auth-only)', () => {
    expect(getPerm('listItems')).toBeUndefined();
  });

  it('getItem has no RequirePermission metadata', () => {
    expect(getPerm('getItem')).toBeUndefined();
  });

  it('listReviews has no RequirePermission metadata (service-layer authz only)', () => {
    expect(getPerm('listReviews')).toBeUndefined();
  });

  it('getDiff has no RequirePermission metadata (service-layer authz only)', () => {
    expect(getPerm('getDiff')).toBeUndefined();
  });

  it('myPermissions has no RequirePermission metadata', () => {
    expect(getPerm('myPermissions')).toBeUndefined();
  });

  // Verify no DataAccess metadata on any prompt route (no owner-scope on prompt routes).
  const allMethods = [
    'listItems',
    'getItem',
    'listReviews',
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
