/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
import 'reflect-metadata';
import { PERMISSION_META_KEY } from '@common/authorization/constants/authorization.constant';
import { DATA_ACCESS_META_KEY } from '@common/authorization/constants/authorization.constant';
import { CoworkerController } from '../coworker.controller';

describe('CoworkerController — perm mapping', () => {
  const getPerm = (prop: string): string[] | undefined =>
    Reflect.getMetadata(PERMISSION_META_KEY, CoworkerController.prototype[prop]);

  const getDataAccess = (prop: string): unknown =>
    Reflect.getMetadata(DATA_ACCESS_META_KEY, CoworkerController.prototype[prop]);

  it('createItem carries coworker_upload', () => {
    expect(getPerm('createItem')).toEqual(['coworker_upload']);
  });

  it('createVersion carries coworker_upload', () => {
    expect(getPerm('createVersion')).toEqual(['coworker_upload']);
  });

  it('approveVersion carries coworker_approve', () => {
    expect(getPerm('approveVersion')).toEqual(['coworker_approve']);
  });

  it('rejectVersion carries coworker_approve', () => {
    expect(getPerm('rejectVersion')).toEqual(['coworker_approve']);
  });

  it('toggleStatus carries coworker_upload or coworker_approve', () => {
    expect(getPerm('toggleStatus')).toEqual(['coworker_upload', 'coworker_approve']);
  });

  it('listItems has no RequirePermission metadata (auth-only)', () => {
    expect(getPerm('listItems')).toBeUndefined();
  });

  it('listChannels has no RequirePermission metadata', () => {
    expect(getPerm('listChannels')).toBeUndefined();
  });

  it('listModels has no RequirePermission metadata', () => {
    expect(getPerm('listModels')).toBeUndefined();
  });

  it('no longer registers a stats route', () => {
    expect((CoworkerController.prototype as unknown as Record<string, unknown>).stats).toBeUndefined();
  });

  it('does not register a download route', () => {
    expect((CoworkerController.prototype as unknown as Record<string, unknown>).downloadMarkdown).toBeUndefined();
  });

  it('getItem has no RequirePermission metadata', () => {
    expect(getPerm('getItem')).toBeUndefined();
  });

  it('listReviews carries coworker_approve', () => {
    expect(getPerm('listReviews')).toEqual(['coworker_approve']);
  });

  it('listReviewSubmitters carries coworker_approve', () => {
    expect(getPerm('listReviewSubmitters')).toEqual(['coworker_approve']);
  });

  it('getDiff carries coworker_upload or coworker_approve', () => {
    expect(getPerm('getDiff')).toEqual(['coworker_upload', 'coworker_approve']);
  });

  it('editVersion carries coworker_upload or coworker_approve', () => {
    expect(getPerm('editVersion')).toEqual(['coworker_upload', 'coworker_approve']);
  });

  it('getVersion has no RequirePermission metadata (service-layer authz only)', () => {
    expect(getPerm('getVersion')).toBeUndefined();
  });

  it('myPermissions has no RequirePermission metadata', () => {
    expect(getPerm('myPermissions')).toBeUndefined();
  });

  const allMethods = [
    'listChannels',
    'listModels',
    'listItems',
    'getItem',
    'listReviews',
    'listReviewSubmitters',
    'getVersion',
    'getDiff',
    'myPermissions',
    'createItem',
    'createVersion',
    'editVersion',
    'approveVersion',
    'rejectVersion',
    'toggleStatus',
  ];

  it.each(allMethods)('%s has no DataAccess metadata (no owner-scope on coworker routes)', (method) => {
    expect(getDataAccess(method)).toBeUndefined();
  });
});
