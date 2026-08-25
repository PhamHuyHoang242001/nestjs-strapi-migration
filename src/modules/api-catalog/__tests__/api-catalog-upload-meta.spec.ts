import { BadRequestException } from '@nestjs/common';
import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ApiCatalogUploadService } from '../api-catalog-upload.service';
import { ApiCatalogController } from '../api-catalog.controller';
import { CreateApiPackageDto } from '../dto/create-api-package.dto';
import { CreateApiVersionDto } from '../dto/create-api-version.dto';

const USER_ID = 100;
const PACKAGE_ID = 1;
const PUBLISHER_ID = 7;

const baseCreateDto = {
  name: 'My Prompt',
  short_description: 'desc',
  category_id: 1,
  publisher_id: PUBLISHER_ID,
  responsible_user_ids: [11, 12],
  usage_guide_html: '<p>Cách dùng</p>',
  tag_ids: [21],
  http_method: 'POST',
  endpoint_path: '/v2/ai/demo',
  input_format: 'body',
  call_mode: 'sync' as const,
  sync_timeout: '30s',
  mock_req: { sync: { hello: 1 } },
  mock_res: { sync: { ok: true } },
};

const baseVersionDto = { ...baseCreateDto, name: 'v2', changelog_note: 'bump' };

// Records every write the transaction performs, in order, so the specs can assert both what was
// persisted and that package metadata lands in the same transaction as the version.
function makeHarness(overrides: { itemMeta?: Record<string, jest.Mock> } = {}) {
  const saved: Array<{ entity?: string; row: Record<string, unknown> }> = [];
  const updates: Array<{ entity?: string; id: unknown; patch: Record<string, unknown> }> = [];
  const order: string[] = [];

  const itemMeta = {
    assertPublisher: jest.fn().mockResolvedValue(undefined),
    assertUsers: jest.fn(async (_m: unknown, ids: number[]) => ids),
    assertTags: jest.fn(async (_m: unknown, ids: number[]) => ids),
    replaceResponsibles: jest.fn(async () => {
      order.push('responsibles');
    }),
    replaceVersionTags: jest.fn(async () => {
      order.push('version-tags');
    }),
    ...overrides.itemMeta,
  };

  const dataSource = {
    transaction: jest.fn(async (cb: (m: unknown) => unknown) => {
      const manager = {
        create: jest.fn((_E: { name?: string }, data: Record<string, unknown>) => ({ ...data })),
        save: jest.fn(async (_E: { name?: string }, obj: Record<string, unknown>) => {
          const row = { ...obj, id: 1 };
          saved.push({ entity: _E?.name, row });
          if (_E?.name === 'ApiVersion') order.push('version');
          if (_E?.name === 'ApiPackage') order.push('package');
          return row;
        }),
        update: jest.fn(async (_E: { name?: string }, id: unknown, patch: Record<string, unknown>) => {
          updates.push({ entity: _E?.name, id, patch });
          if (patch.publisher_id !== undefined) order.push('publisher');
        }),
        query: jest.fn().mockResolvedValue([{ max: '3' }]),
      };
      return cb(manager);
    }),
  };

  const packageRepo = {
    findOne: jest.fn().mockResolvedValue({ id: PACKAGE_ID, is_deleted: false, created_by: USER_ID }),
    save: jest.fn(),
  };
  const versionRepo = { findOne: jest.fn().mockResolvedValue(null), save: jest.fn() };
  const avatarUrl = { assertStrapiUrl: jest.fn() };
  const permissionQuery = { getUserPermissions: jest.fn().mockResolvedValue(['api_upload']) };

  const service = new ApiCatalogUploadService(
    packageRepo as never,
    versionRepo as never,
    dataSource as never,
    avatarUrl as never,
    permissionQuery as never,
    itemMeta as never,
  );

  return { service, itemMeta, saved, updates, order };
}

const versionRow = (saved: Array<{ entity?: string; row: Record<string, unknown> }>) =>
  saved.find((s) => s.entity === 'ApiVersion')?.row;

describe('ApiCatalogUploadService — asset-hub metadata on create', () => {
  it('persists publisher_id on the package', async () => {
    const h = makeHarness();

    await h.service.createNew(baseCreateDto as never, USER_ID);

    expect(h.saved.find((s) => s.entity === 'ApiPackage')?.row.publisher_id).toBe(PUBLISHER_ID);
  });

  it('validates tags against the prompt workspace', async () => {
    const h = makeHarness();

    await h.service.createNew(baseCreateDto as never, USER_ID);

    expect(h.itemMeta.assertTags).toHaveBeenCalledWith(expect.anything(), [21], 'api-catalog');
  });

  it('writes the people in charge and the version tags in the create transaction', async () => {
    const h = makeHarness();

    await h.service.createNew(baseCreateDto as never, USER_ID);

    expect(h.itemMeta.replaceResponsibles).toHaveBeenCalledWith(expect.anything(), 'api-catalog', 1, [11, 12]);
    expect(h.itemMeta.replaceVersionTags).toHaveBeenCalledWith(expect.anything(), 'api-catalog', 1, [21]);
    expect(h.order.indexOf('responsibles')).toBeLessThan(h.order.indexOf('version'));
    expect(h.order.indexOf('version')).toBeLessThan(h.order.indexOf('version-tags'));
  });

  it('stores the sanitized guide, not the submitted markup', async () => {
    const h = makeHarness();

    await h.service.createNew(
      { ...baseCreateDto, usage_guide_html: '<p>ok</p><script>steal()</script>' } as never,
      USER_ID,
    );

    expect(versionRow(h.saved)?.usage_guide_html).toBe('<p>ok</p>');
  });

  it('rejects a create whose guide has no text and no image', async () => {
    const h = makeHarness();

    await expect(
      h.service.createNew({ ...baseCreateDto, usage_guide_html: '<p><br /></p>' } as never, USER_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('surfaces an unknown person in charge as a 400 and writes nothing', async () => {
    const h = makeHarness({
      itemMeta: { assertUsers: jest.fn().mockRejectedValue(new BadRequestException('INVALID_RESPONSIBLE_USERS')) },
    });

    await expect(h.service.createNew(baseCreateDto as never, USER_ID)).rejects.toBeInstanceOf(BadRequestException);
    expect(h.saved.some((s) => s.entity === 'ApiVersion')).toBe(false);
  });

  it('no longer writes the legacy jsonb tag array', async () => {
    const h = makeHarness();

    await h.service.createNew(baseCreateDto as never, USER_ID);

    expect(versionRow(h.saved)).not.toHaveProperty('tags');
  });
});

describe('ApiCatalogUploadService — asset-hub metadata on bump', () => {
  it('updates the package publisher inside the version transaction', async () => {
    const h = makeHarness();

    await h.service.createVersion(PACKAGE_ID, { ...baseVersionDto, publisher_id: 9 } as never, USER_ID);

    expect(h.updates).toContainEqual({ entity: 'ApiPackage', id: PACKAGE_ID, patch: { publisher_id: 9 } });
    expect(h.order.indexOf('publisher')).toBeLessThan(h.order.indexOf('version'));
  });

  it('replaces the people in charge on a bump', async () => {
    const h = makeHarness();

    await h.service.createVersion(PACKAGE_ID, { ...baseVersionDto, responsible_user_ids: [55] } as never, USER_ID);

    expect(h.itemMeta.replaceResponsibles).toHaveBeenCalledWith(expect.anything(), 'api-catalog', PACKAGE_ID, [55]);
  });

  it('accepts an empty guide on a bump — artifacts predating guides stay editable', async () => {
    const h = makeHarness();

    await h.service.createVersion(PACKAGE_ID, { ...baseVersionDto, usage_guide_html: '' } as never, USER_ID);

    expect(versionRow(h.saved)?.usage_guide_html).toBe('');
  });
});

describe('prompt write DTOs', () => {
  it('rejects a create without a publisher', async () => {
    const errors = await validate(plainToInstance(CreateApiPackageDto, { ...baseCreateDto, publisher_id: undefined }));

    expect(errors.map((e) => e.property)).toContain('publisher_id');
  });

  it('rejects a create with no person in charge', async () => {
    const errors = await validate(
      plainToInstance(CreateApiPackageDto, { ...baseCreateDto, responsible_user_ids: [] }),
    );

    expect(errors.map((e) => e.property)).toContain('responsible_user_ids');
  });

  it('accepts a fully populated create body', async () => {
    const errors = await validate(plainToInstance(CreateApiPackageDto, baseCreateDto));

    expect(errors).toHaveLength(0);
  });

  it('accepts a bump body with an empty guide', async () => {
    const errors = await validate(plainToInstance(CreateApiVersionDto, { ...baseVersionDto, usage_guide_html: '' }));

    expect(errors).toHaveLength(0);
  });

  // The controllers validate with forbidNonWhitelisted, so an undeclared property is a 400 rather
  // than being silently dropped — that is what retires the old freeform `tags: string[]` input.
  it.each([
    ['create', CreateApiPackageDto, baseCreateDto],
    ['bump', CreateApiVersionDto, baseVersionDto],
  ])('rejects a leftover freeform tags array on %s', async (_label, Dto, body) => {
    const errors = await validate(plainToInstance(Dto, { ...body, tags: ['foo'] }), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors.map((e) => e.property)).toContain('tags');
  });
});

describe('ApiCatalogController — no package metadata endpoint', () => {
  it('exposes the status toggle but no bare item PATCH', () => {
    const proto = ApiCatalogController.prototype as unknown as Record<string, unknown>;

    expect(typeof proto.toggleStatus).toBe('function');
    expect(proto.patchItem).toBeUndefined();
    expect(proto.updateItem).toBeUndefined();
    expect(proto.patchMeta).toBeUndefined();
  });
});
