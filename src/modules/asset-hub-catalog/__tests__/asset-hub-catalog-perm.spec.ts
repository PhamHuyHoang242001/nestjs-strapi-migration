import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PERMISSION_META_KEY } from '@common/authorization/constants/authorization.constant';
import { AssetHubCatalogController } from '../asset-hub-catalog.controller';
import { ListTagsQueryDto, ListUsersQueryDto } from '../dto';

const getPerm = (prop: string): string[] | undefined =>
  Reflect.getMetadata(PERMISSION_META_KEY, AssetHubCatalogController.prototype[prop]);

describe('AssetHubCatalogController — perm mapping', () => {
  it('gates the user directory behind any upload or approve grant', () => {
    // PermissionGuard is OR across codes: holding one of the four is enough.
    expect(getPerm('listUsers')).toEqual([
      'skill_upload',
      'prompt_upload',
      'skill_approve',
      'prompt_approve',
      'api_upload',
      'api_approve',
    ]);
  });

  it.each(['listTags', 'listPublishers'])('leaves %s Bearer-only', (prop) => {
    expect(getPerm(prop)).toBeUndefined();
  });
});

describe('catalog query DTOs', () => {
  it('rejects an unknown artifact_type', async () => {
    const errors = await validate(plainToInstance(ListTagsQueryDto, { artifact_type: 'video' }));

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('artifact_type');
  });

  it('rejects an unknown kind', async () => {
    const errors = await validate(plainToInstance(ListTagsQueryDto, { kind: '团队' }));

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('kind');
  });

  it('accepts the seeded enum values', async () => {
    const errors = await validate(plainToInstance(ListTagsQueryDto, { artifact_type: 'skill', kind: 'personal' }));

    expect(errors).toHaveLength(0);
  });

  it('rejects a user-directory limit above the cap', async () => {
    const errors = await validate(plainToInstance(ListUsersQueryDto, { limit: '500' }));

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('limit');
  });

  it('defaults the user directory to page 1 / limit 20', () => {
    const dto = plainToInstance(ListUsersQueryDto, {});

    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
  });

  it('accepts a directory request with no keyword', async () => {
    const errors = await validate(plainToInstance(ListUsersQueryDto, { page: '2', limit: '50' }));

    expect(errors).toHaveLength(0);
  });
});
