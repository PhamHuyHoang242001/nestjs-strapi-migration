import { BadRequestException } from '@nestjs/common';
import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { SkillPackageUploadService } from '../skill-package-upload.service';
import { SkillPackageController } from '../skill-package.controller';
import { CreateSkillPackageDto } from '../dto/create-skill-package.dto';
import { CreateSkillVersionDto } from '../dto/create-skill-version.dto';

jest.mock('../skill-zip.util', () => ({
  extractSkillZip: jest.fn().mockReturnValue({
    skillMd: '# mock skill.md',
    zipTree: [{ path: 'skill.md', isDir: false, size: 16 }],
  }),
}));

const USER_ID = 100;
const PACKAGE_ID = 1;
const PUBLISHER_ID = 7;

const baseCreateDto = {
  file: { fileUrl: '/uploads/skill.zip', name: 'skill.zip' },
  name: 'My Skill',
  short_description: 'desc',
  category_id: 1,
  publisher_id: PUBLISHER_ID,
  responsible_user_ids: [11, 12],
  usage_guide_html: '<p>Chạy lệnh</p>',
  tag_ids: [21],
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
          if (_E?.name === 'SkillVersion') order.push('version');
          if (_E?.name === 'SkillPackage') order.push('package');
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
  const fileFetch = {
    downloadZip: jest.fn().mockResolvedValue({
      buffer: Buffer.from('zip'),
      mimeType: 'application/zip',
      size: 1024,
      filename: 'hash.zip',
    }),
    assertStrapiUrl: jest.fn(),
  };
  const permissionQuery = { getUserPermissions: jest.fn().mockResolvedValue(['skill_upload']) };

  const service = new SkillPackageUploadService(
    packageRepo as never,
    versionRepo as never,
    dataSource as never,
    fileFetch as never,
    permissionQuery as never,
    itemMeta as never,
  );

  return { service, itemMeta, saved, updates, order };
}

const versionRow = (saved: Array<{ entity?: string; row: Record<string, unknown> }>) =>
  saved.find((s) => s.entity === 'SkillVersion')?.row;

describe('SkillPackageUploadService — asset-hub metadata on create', () => {
  it('persists publisher_id on the package', async () => {
    const h = makeHarness();

    await h.service.createNew(baseCreateDto as never, USER_ID);

    expect(h.saved.find((s) => s.entity === 'SkillPackage')?.row.publisher_id).toBe(PUBLISHER_ID);
  });

  it('validates publisher, users and tags before writing', async () => {
    const h = makeHarness();

    await h.service.createNew(baseCreateDto as never, USER_ID);

    expect(h.itemMeta.assertPublisher).toHaveBeenCalledWith(expect.anything(), PUBLISHER_ID);
    expect(h.itemMeta.assertUsers).toHaveBeenCalledWith(expect.anything(), [11, 12]);
    expect(h.itemMeta.assertTags).toHaveBeenCalledWith(expect.anything(), [21], 'skill');
  });

  it('writes the people in charge and the version tags in the create transaction', async () => {
    const h = makeHarness();

    await h.service.createNew(baseCreateDto as never, USER_ID);

    expect(h.itemMeta.replaceResponsibles).toHaveBeenCalledWith(expect.anything(), 'skill', 1, [11, 12]);
    expect(h.itemMeta.replaceVersionTags).toHaveBeenCalledWith(expect.anything(), 'skill', 1, [21]);
    // PIC rows attach to the package before the version row exists; tags need the version id.
    expect(h.order.indexOf('responsibles')).toBeLessThan(h.order.indexOf('version'));
    expect(h.order.indexOf('version')).toBeLessThan(h.order.indexOf('version-tags'));
  });

  it('stores the sanitized guide, not the submitted markup', async () => {
    const h = makeHarness();

    await h.service.createNew(
      { ...baseCreateDto, usage_guide_html: '<p onclick="x()">ok</p><script>steal()</script>' } as never,
      USER_ID,
    );

    const guide = versionRow(h.saved)?.usage_guide_html as string;
    expect(guide).toBe('<p>ok</p>');
    expect(guide).not.toContain('script');
    expect(guide).not.toContain('onclick');
  });

  it('rejects a create whose guide has no text and no image', async () => {
    const h = makeHarness();

    await expect(
      h.service.createNew({ ...baseCreateDto, usage_guide_html: '<p>  </p>' } as never, USER_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a create with an empty guide string', async () => {
    const h = makeHarness();

    await expect(h.service.createNew({ ...baseCreateDto, usage_guide_html: '' } as never, USER_ID)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('accepts an image-only guide', async () => {
    const h = makeHarness();

    await h.service.createNew(
      { ...baseCreateDto, usage_guide_html: '<p><img src="http://localhost:1337/uploads/x.gif" /></p>' } as never,
      USER_ID,
    );

    expect(versionRow(h.saved)?.usage_guide_html).toContain('<img');
  });

  it('surfaces an unknown tag as a 400 and writes nothing', async () => {
    const h = makeHarness({
      itemMeta: {
        assertTags: jest.fn().mockRejectedValue(new BadRequestException('INVALID_TAGS')),
      },
    });

    await expect(h.service.createNew(baseCreateDto as never, USER_ID)).rejects.toBeInstanceOf(BadRequestException);
    expect(h.saved.some((s) => s.entity === 'SkillVersion')).toBe(false);
  });

  it('no longer writes the legacy jsonb tag array', async () => {
    const h = makeHarness();

    await h.service.createNew(baseCreateDto as never, USER_ID);

    expect(versionRow(h.saved)).not.toHaveProperty('tags');
  });
});

describe('SkillPackageUploadService — asset-hub metadata on bump', () => {
  it('updates the package publisher inside the version transaction', async () => {
    const h = makeHarness();

    await h.service.createVersion(PACKAGE_ID, { ...baseVersionDto, publisher_id: 9 } as never, USER_ID);

    expect(h.updates).toContainEqual({ entity: 'SkillPackage', id: PACKAGE_ID, patch: { publisher_id: 9 } });
    expect(h.order.indexOf('publisher')).toBeLessThan(h.order.indexOf('version'));
  });

  it('replaces the people in charge on a bump', async () => {
    const h = makeHarness();

    await h.service.createVersion(PACKAGE_ID, { ...baseVersionDto, responsible_user_ids: [55] } as never, USER_ID);

    expect(h.itemMeta.replaceResponsibles).toHaveBeenCalledWith(expect.anything(), 'skill', PACKAGE_ID, [55]);
  });

  it('accepts an empty guide on a bump — artifacts predating guides stay editable', async () => {
    const h = makeHarness();

    await h.service.createVersion(PACKAGE_ID, { ...baseVersionDto, usage_guide_html: '' } as never, USER_ID);

    expect(versionRow(h.saved)?.usage_guide_html).toBe('');
  });

  it('attaches the new version tags to the new version id', async () => {
    const h = makeHarness();

    await h.service.createVersion(PACKAGE_ID, { ...baseVersionDto, tag_ids: [21, 22] } as never, USER_ID);

    expect(h.itemMeta.replaceVersionTags).toHaveBeenCalledWith(expect.anything(), 'skill', 1, [21, 22]);
  });
});

describe('skill write DTOs', () => {
  const validCreate = { ...baseCreateDto };

  it('rejects a create without a publisher', async () => {
    const errors = await validate(plainToInstance(CreateSkillPackageDto, { ...validCreate, publisher_id: undefined }));

    expect(errors.map((e) => e.property)).toContain('publisher_id');
  });

  it('rejects a create with no person in charge', async () => {
    const errors = await validate(plainToInstance(CreateSkillPackageDto, { ...validCreate, responsible_user_ids: [] }));

    expect(errors.map((e) => e.property)).toContain('responsible_user_ids');
  });

  it('rejects duplicate people in charge', async () => {
    const errors = await validate(
      plainToInstance(CreateSkillPackageDto, { ...validCreate, responsible_user_ids: [11, 11] }),
    );

    expect(errors.map((e) => e.property)).toContain('responsible_user_ids');
  });

  it('rejects more than twenty people in charge', async () => {
    const errors = await validate(
      plainToInstance(CreateSkillPackageDto, {
        ...validCreate,
        responsible_user_ids: Array.from({ length: 21 }, (_, i) => i + 1),
      }),
    );

    expect(errors.map((e) => e.property)).toContain('responsible_user_ids');
  });

  it('rejects a create with no usage guide field at all', async () => {
    const errors = await validate(
      plainToInstance(CreateSkillPackageDto, { ...validCreate, usage_guide_html: undefined }),
    );

    expect(errors.map((e) => e.property)).toContain('usage_guide_html');
  });

  it('rejects more than twenty tags', async () => {
    const errors = await validate(
      plainToInstance(CreateSkillPackageDto, { ...validCreate, tag_ids: Array.from({ length: 21 }, (_, i) => i + 1) }),
    );

    expect(errors.map((e) => e.property)).toContain('tag_ids');
  });

  it('accepts a fully populated create body', async () => {
    const errors = await validate(plainToInstance(CreateSkillPackageDto, validCreate));

    expect(errors).toHaveLength(0);
  });

  it('accepts a bump body with an empty guide', async () => {
    const errors = await validate(plainToInstance(CreateSkillVersionDto, { ...baseVersionDto, usage_guide_html: '' }));

    expect(errors).toHaveLength(0);
  });

  // The controllers validate with forbidNonWhitelisted, so an undeclared property is a 400 rather
  // than being silently dropped — that is what retires the old freeform `tags: string[]` input.
  it.each([
    ['create', CreateSkillPackageDto, validCreate],
    ['bump', CreateSkillVersionDto, baseVersionDto],
  ])('rejects a leftover freeform tags array on %s', async (_label, Dto, body) => {
    const errors = await validate(plainToInstance(Dto, { ...body, tags: ['foo'] }), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors.map((e) => e.property)).toContain('tags');
  });
});

describe('SkillPackageController — no package metadata endpoint', () => {
  it('exposes the status toggle but no bare item PATCH', () => {
    const proto = SkillPackageController.prototype as unknown as Record<string, unknown>;

    expect(typeof proto.toggleStatus).toBe('function');
    // Editing metadata goes through PUT items/:id/versions; there is no separate metadata route.
    expect(proto.patchItem).toBeUndefined();
    expect(proto.updateItem).toBeUndefined();
    expect(proto.patchMeta).toBeUndefined();
  });
});
