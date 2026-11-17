import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ApiCatalogSyncService } from '../api-catalog-sync.service';
import { SyncApiCatalogItemDto } from '../dto/sync-api-catalog-item.dto';
import { ApiVersionState } from '@modules/databases/api-catalog-version.entity';
import { ApiPackageStatus } from '@modules/databases/api-catalog-package.entity';

const BODY = {
  code: 'core_bank_transfer',
  name: 'Chuyển khoản',
  short_description: 'API chuyển khoản',
  kind: 'enterprise',
  category_name: 'Thanh toán',
  publisher_name: 'Khối CNTT',
  owning_unit_name: 'Trung tâm API',
  creator_email: 'c@corp.vn',
  responsible_emails: ['a@corp.vn', 'b@corp.vn'],
  coworker_codes: ['cw_1'],
  http_method: 'POST',
  endpoint_path: '/v1/transfer',
  input_format: 'body',
  call_mode: 'sync',
  sync_timeout: '30s',
  mock_req: { amount: 1, account: 'x' },
  mock_res: { ok: true },
} as any;

// A stored version whose synced columns equal BODY (mock_req keys deliberately reordered, as jsonb does).
const SAME_AS_BODY = {
  name: BODY.name, short_description: BODY.short_description, category_id: 3, kind: 'enterprise',
  http_method: 'POST', endpoint_path: '/v1/transfer', input_format: 'body', call_mode: 'sync', sync_timeout: '30s',
  sla: null, tps: null, latency_p95: null, throughput: null, max_payload: null, rate_limit: null, encryption: null,
  mock_req: { account: 'x', amount: 1 }, mock_res: { ok: true },
};

/**
 * Fake transaction manager: answers lookups by SQL text / entity + state and records writes.
 * `versions` maps a state (draft / pending) or 'active' to the existing version row.
 */
function setup(
  opts: {
    pkg?: any;
    versions?: Partial<Record<'draft' | 'pending' | 'active', any>>;
    linkedCoworkers?: number[];
    users?: string[];
    coworkers?: string[];
  } = {},
) {
  const users = opts.users ?? ['a@corp.vn', 'b@corp.vn', 'c@corp.vn'];
  const coworkers = opts.coworkers ?? ['cw_1'];
  const versions = opts.versions ?? {};
  let nextId = 500;
  const manager: any = {
    query: jest.fn(async (sql: string) => {
      if (sql.includes('FROM ai_hub_categories')) return [{ id: 3 }];
      if (sql.includes('FROM ai_hub_publishers')) return [{ id: 7 }];
      if (sql.includes('FROM users')) return users.map((email, i) => ({ id: 11 + i, email }));
      if (sql.includes('FROM coworker_packages')) return coworkers.map((code, i) => ({ id: 21 + i, code }));
      if (sql.includes('FROM api_catalog_version_coworkers')) {
        return (opts.linkedCoworkers ?? []).map((id) => ({ coworker_package_id: id }));
      }
      if (sql.includes('MAX(version_no)')) return [{ max: versions.active ? String(versions.active.version_no) : null }];
      return [];
    }),
    findOne: jest.fn(async (Entity: any, q: any) => {
      if (Entity.name === 'ApiPackage') return opts.pkg ?? null;
      if (q.where.state === ApiVersionState.DRAFT) return versions.draft ?? null;
      if (q.where.state === ApiVersionState.PENDING) return versions.pending ?? null;
      return versions.active ?? null;
    }),
    create: jest.fn((_E: any, data: any) => ({ ...data })),
    save: jest.fn(async (_E: any, obj: any) => ({ ...obj, id: obj.id ?? nextId++ })),
    update: jest.fn(),
  };
  const ds: any = { transaction: jest.fn(async (cb: any) => cb(manager)) };
  const itemMeta: any = { replaceResponsibles: jest.fn(), replaceVersionCoworkers: jest.fn() };
  return { service: new ApiCatalogSyncService(ds, itemMeta), manager, itemMeta };
}

describe('ApiCatalogSyncService.upsert', () => {
  it('creates the package and a draft (no guide / avatar) owned by creator_email', async () => {
    const { service, manager, itemMeta } = setup();
    const res = await service.upsert(BODY);

    expect(res).toMatchObject({ code: BODY.code, action: 'created', state: ApiVersionState.DRAFT });
    expect(manager.save.mock.calls[0][1]).toMatchObject({ code: BODY.code, created_by: 13, publisher_id: 7, status: ApiPackageStatus.ACTIVE });
    expect(manager.save.mock.calls[1][1]).toMatchObject({
      state: ApiVersionState.DRAFT, version_no: 1, old_version: null, category_id: 3, submitted_by: 13,
      usage_guide_html: '', avatar_url: null,
    });
    expect(itemMeta.replaceResponsibles).toHaveBeenCalledWith(manager, 'api-catalog', expect.any(Number), [11, 12]);
    expect(itemMeta.replaceVersionCoworkers).toHaveBeenCalledWith(manager, 'api-catalog', expect.any(Number), [21]);
    // A draft never becomes the live version.
    expect(manager.update).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({ active_version_id: expect.anything() }));
  });

  it('updates an existing draft in place and keeps the guide / avatar owners typed', async () => {
    const draft = { id: 70, state: ApiVersionState.DRAFT, name: 'old', usage_guide_html: '<p>typed</p>', avatar_url: 'https://s/a.png' };
    const { service, manager } = setup({ pkg: { id: 1, created_by: 11, active_version_id: null }, versions: { draft } });
    const res = await service.upsert(BODY);

    expect(res).toEqual({ code: BODY.code, action: 'updated', package_id: 1, version_id: 70, state: ApiVersionState.DRAFT });
    expect(manager.save).toHaveBeenCalledTimes(1);
    expect(manager.save.mock.calls[0][1]).toMatchObject({ id: 70, name: BODY.name, usage_guide_html: '<p>typed</p>', avatar_url: 'https://s/a.png' });
  });

  it('returns unchanged when the draft already holds the same data', async () => {
    const draft = { id: 70, state: ApiVersionState.DRAFT, ...SAME_AS_BODY };
    const { service, manager } = setup({ pkg: { id: 1, created_by: 11 }, versions: { draft }, linkedCoworkers: [21] });
    expect(await service.upsert(BODY)).toMatchObject({ action: 'unchanged', version_id: 70 });
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('creates a new draft next to a pending version, carrying its guide / avatar', async () => {
    const pending = { id: 80, state: ApiVersionState.PENDING, name: 'old', usage_guide_html: '<p>g</p>', avatar_url: 'https://s/p.png' };
    const active = { id: 60, version_no: 2, state: ApiVersionState.APPROVED };
    const { service, manager } = setup({ pkg: { id: 1, created_by: 99, active_version_id: 60 }, versions: { pending, active } });
    const res = await service.upsert({ ...BODY, status: 'inactive' });

    expect(res).toMatchObject({ action: 'updated', package_id: 1, state: ApiVersionState.DRAFT });
    expect(manager.update).toHaveBeenCalledWith(
      expect.anything(),
      1,
      expect.objectContaining({ publisher_id: 7, status: 'inactive', created_by: 13 }),
    );
    // The pending version is left untouched; it is only cleared when the draft is submitted.
    expect(manager.update).toHaveBeenCalledTimes(1);
    expect(manager.save.mock.calls[0][1]).toMatchObject({
      state: ApiVersionState.DRAFT, old_version: 2, submitted_by: 13, usage_guide_html: '<p>g</p>', avatar_url: 'https://s/p.png',
    });
  });

  it('returns unchanged when the data equals the active version and nothing is pending', async () => {
    const active = { id: 60, version_no: 2, state: ApiVersionState.APPROVED, ...SAME_AS_BODY };
    const { service, manager } = setup({ pkg: { id: 1, created_by: 11, active_version_id: 60 }, versions: { active }, linkedCoworkers: [21] });
    expect(await service.upsert(BODY)).toMatchObject({ action: 'unchanged', version_id: 60, state: ApiVersionState.APPROVED });
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('reports every unknown or inactive email', async () => {
    const { service } = setup({ users: ['a@corp.vn', 'c@corp.vn'] });
    await expect(service.upsert(BODY)).rejects.toThrow(
      new BadRequestException('INVALID_RESPONSIBLE_USERS: active users not found: b@corp.vn'),
    );
  });

  it('rejects an unknown or inactive creator email', async () => {
    const { service } = setup({ users: ['a@corp.vn', 'b@corp.vn'] });
    await expect(service.upsert(BODY)).rejects.toThrow('INVALID_CREATOR: active user not found: c@corp.vn');
  });

  it('reports unknown coworker codes', async () => {
    const { service } = setup({ coworkers: [] });
    await expect(service.upsert(BODY)).rejects.toThrow('INVALID_COWORKERS: coworker codes not found: cw_1');
  });
});

describe('SyncApiCatalogItemDto', () => {
  const errorsFor = async (patch: object) =>
    (await validate(plainToInstance(SyncApiCatalogItemDto, { ...BODY, ...patch }))).map((e) => e.property);

  it('accepts a valid body and normalizes emails', async () => {
    const dto = plainToInstance(SyncApiCatalogItemDto, { ...BODY, responsible_emails: [' A@Corp.vn '] });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.responsible_emails).toEqual(['a@corp.vn']);
  });

  it('does not accept usage guide or avatar (filled in on the web)', async () => {
    const dto = plainToInstance(SyncApiCatalogItemDto, { ...BODY, usage_guide_html: '<p>x</p>', avatar_url: 'https://x' });
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors.map((e) => e.property)).toEqual(expect.arrayContaining(['usage_guide_html', 'avatar_url']));
  });

  it('rejects the reserved manual code prefix and bad characters', async () => {
    expect(await errorsFor({ code: 'api_catalog_12' })).toContain('code');
    expect(await errorsFor({ code: 'có dấu' })).toContain('code');
  });

  it('requires a valid creator email and normalizes it', async () => {
    expect(await errorsFor({ creator_email: undefined })).toContain('creator_email');
    expect(await errorsFor({ creator_email: 'nope' })).toContain('creator_email');
    expect(plainToInstance(SyncApiCatalogItemDto, { ...BODY, creator_email: ' C@Corp.VN ' }).creator_email).toBe('c@corp.vn');
  });

  it('rejects invalid emails and empty responsible list', async () => {
    expect(await errorsFor({ responsible_emails: ['not-an-email'] })).toContain('responsible_emails');
    expect(await errorsFor({ responsible_emails: [] })).toContain('responsible_emails');
  });
});
