import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AssetHubSupporterService } from '../asset-hub-supporter.service';
import { AiHubPackageParamDto, ReplaceSupportersDto } from '../dto';
import { CreatePromptPackageDto } from '@modules/prompt-library/dto';

const CREATOR = 10;
const SUPPORTER = 20;
const STRANGER = 30;
const PACKAGE_ID = 5;

// Manager whose query() answers by SQL shape: package lock, eligibility check (with or without the
// upload-code predicate), final email lookup. `eligibleIds` = ids the eligibility query returns.
function makeManager(opts: { pkg?: { id: number; created_by: number } | null; eligibleIds?: number[] }) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const manager = {
    query: jest.fn((sql: string, params: unknown[]) => {
      calls.push({ sql, params });
      if (sql.includes('FOR UPDATE')) return Promise.resolve(opts.pkg === null ? [] : [opts.pkg ?? { id: PACKAGE_ID, created_by: CREATOR }]);
      if (sql.includes('SELECT u.id FROM users u')) {
        return Promise.resolve((opts.eligibleIds ?? []).map((id) => ({ id })));
      }
      if (sql.includes('SELECT id, email FROM users')) {
        return Promise.resolve((params[0] as number[]).map((id) => ({ id, email: `u${id}@x.vn` })));
      }
      return Promise.resolve([]);
    }),
  };
  return { manager, calls };
}

function makeService(manager: unknown, currentSupporters: number[] = [SUPPORTER]) {
  const dataSource = {
    transaction: jest.fn((cb: (m: unknown) => unknown) => cb(manager)),
    query: jest.fn(),
  };
  const itemMeta = {
    listSupporterIds: jest.fn().mockResolvedValue(currentSupporters),
    assertSupporterUsers: jest.fn((_m: unknown, ids: number[]) => Promise.resolve([...new Set(ids)])),
    replaceSupporters: jest.fn().mockResolvedValue(undefined),
  };
  const service = new AssetHubSupporterService(dataSource as never, itemMeta as never);
  return { service, dataSource, itemMeta };
}

describe('AssetHubSupporterService.replaceSupporters', () => {
  it('creator replaces supporters with upload-eligible users', async () => {
    const { manager, calls } = makeManager({ eligibleIds: [40, 41] });
    const { service, itemMeta } = makeService(manager);

    const res = await service.replaceSupporters('skill', PACKAGE_ID, [40, 41], CREATOR);

    expect(itemMeta.replaceSupporters).toHaveBeenCalledWith(manager, 'skill', PACKAGE_ID, [40, 41]);
    expect(res).toEqual({
      id: PACKAGE_ID,
      supporters: [
        { id: 40, email: 'u40@x.vn' },
        { id: 41, email: 'u41@x.vn' },
      ],
    });
    // Package lock targets the workspace's own table; eligibility is checked against skill_upload.
    expect(calls.find((c) => c.sql.includes('FOR UPDATE'))?.sql).toContain('skill_packages');
    expect(calls.find((c) => c.sql.includes('user_roles'))?.params[0]).toBe('skill_upload');
  });

  it('a current supporter may replace (and may clear with [])', async () => {
    const { manager } = makeManager({});
    const { service, itemMeta } = makeService(manager);

    const res = await service.replaceSupporters('coworker', PACKAGE_ID, [], SUPPORTER);

    expect(itemMeta.replaceSupporters).toHaveBeenCalledWith(manager, 'coworker', PACKAGE_ID, []);
    expect(res.supporters).toEqual([]);
  });

  it('neither creator nor supporter → 403, nothing written', async () => {
    const { manager } = makeManager({ eligibleIds: [40] });
    const { service, itemMeta } = makeService(manager);

    await expect(service.replaceSupporters('skill', PACKAGE_ID, [40], STRANGER)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(itemMeta.replaceSupporters).not.toHaveBeenCalled();
  });

  it('missing / deleted package → 404', async () => {
    const { manager } = makeManager({ pkg: null });
    const { service } = makeService(manager);

    await expect(service.replaceSupporters('api-catalog', PACKAGE_ID, [], CREATOR)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects users without the workspace upload code', async () => {
    const { manager } = makeManager({ eligibleIds: [40] });
    const { service, itemMeta } = makeService(manager);

    await expect(service.replaceSupporters('api-catalog', PACKAGE_ID, [40, 99], CREATOR)).rejects.toThrow(
      new BadRequestException('INVALID_SUPPORTERS: users without api_upload: 99'),
    );
    expect(itemMeta.replaceSupporters).not.toHaveBeenCalled();
  });

  it('prompt: any live user is eligible (no upload-code check)', async () => {
    const { manager, calls } = makeManager({ eligibleIds: [99] });
    const { service, itemMeta } = makeService(manager);

    await service.replaceSupporters('prompt', PACKAGE_ID, [99], CREATOR);

    const eligibility = calls.find((c) => c.sql.includes('SELECT u.id FROM users u'));
    expect(eligibility?.sql).not.toContain('user_roles');
    expect(eligibility?.sql).toContain('u.email IS NOT NULL');
    expect(itemMeta.replaceSupporters).toHaveBeenCalledWith(manager, 'prompt', PACKAGE_ID, [99]);
  });

  it('prompt: a user the picker would not show (deleted / no email) is rejected', async () => {
    const { manager } = makeManager({ eligibleIds: [] });
    const { service, itemMeta } = makeService(manager);

    await expect(service.replaceSupporters('prompt', PACKAGE_ID, [99], CREATOR)).rejects.toThrow(
      new BadRequestException('INVALID_SUPPORTERS: users not eligible: 99'),
    );
    expect(itemMeta.replaceSupporters).not.toHaveBeenCalled();
  });

  it('403 is decided before eligibility: a stranger never reaches the user checks', async () => {
    const { manager, calls } = makeManager({ eligibleIds: [40] });
    const { service, itemMeta } = makeService(manager);

    await expect(service.replaceSupporters('skill', PACKAGE_ID, [40], STRANGER)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(itemMeta.assertSupporterUsers).not.toHaveBeenCalled();
    expect(calls.some((c) => c.sql.includes('SELECT u.id FROM users u'))).toBe(false);
  });

  it('eligibility counts super_admin (guard lets them upload without the code)', async () => {
    const { manager, calls } = makeManager({ eligibleIds: [40] });
    const { service } = makeService(manager);

    await service.replaceSupporters('skill', PACKAGE_ID, [40], CREATOR);

    expect(calls.find((c) => c.sql.includes('SELECT u.id FROM users u'))?.sql).toContain("u.type = 'super_admin'");
  });
});

describe('AssetHubSupporterService.listCandidates', () => {
  function stubList(service: AssetHubSupporterService, dataSource: { query: jest.Mock }) {
    dataSource.query.mockResolvedValueOnce([{ total: 1 }]).mockResolvedValueOnce([{ id: 7, email: 'a@x.vn' }]);
    return service;
  }

  it('skill: filters to skill_upload holders, binds keyword and paging', async () => {
    const { service, dataSource } = makeService({});
    const res = await stubList(service, dataSource).listCandidates('skill', { page: 2, limit: 10, search: ' ab ' });

    const [countSql, countArgs] = dataSource.query.mock.calls[0] as [string, unknown[]];
    const [rowSql, rowArgs] = dataSource.query.mock.calls[1] as [string, unknown[]];
    expect(countSql).toContain('user_roles');
    expect(countArgs).toEqual(['skill_upload', '%ab%']);
    expect(rowSql).toContain('LIMIT $3 OFFSET $4');
    expect(rowArgs).toEqual(['skill_upload', '%ab%', 10, 10]);
    expect(res).toEqual({ data: [{ id: 7, email: 'a@x.vn' }], meta: { total: 1, page: 2, limit: 10 } });
  });

  it('prompt + search: keyword binds as $1 when there is no upload code', async () => {
    const { service, dataSource } = makeService({});
    await stubList(service, dataSource).listCandidates('prompt', { search: 'ab' });

    const [countSql, countArgs] = dataSource.query.mock.calls[0] as [string, unknown[]];
    const [rowSql, rowArgs] = dataSource.query.mock.calls[1] as [string, unknown[]];
    expect(countSql).toContain('u.email ILIKE $1');
    expect(countArgs).toEqual(['%ab%']);
    expect(rowSql).toContain('LIMIT $2 OFFSET $3');
    expect(rowArgs).toEqual(['%ab%', 20, 0]);
  });

  it('prompt: lists every live user (no upload-code filter)', async () => {
    const { service, dataSource } = makeService({});
    await stubList(service, dataSource).listCandidates('prompt', {});

    const [countSql, countArgs] = dataSource.query.mock.calls[0] as [string, unknown[]];
    const [, rowArgs] = dataSource.query.mock.calls[1] as [string, unknown[]];
    expect(countSql).not.toContain('user_roles');
    expect(countArgs).toEqual([]);
    expect(rowArgs).toEqual([20, 0]);
  });
});

describe('supporter DTOs', () => {
  it('rejects an unknown workspace type', async () => {
    const errors = await validate(plainToInstance(AiHubPackageParamDto, { type: 'video', id: '1' }));
    expect(errors.map((e) => e.property)).toContain('type');
  });

  it('requires supporter_ids as an array of unique positive ints', async () => {
    expect(await validate(plainToInstance(ReplaceSupportersDto, { supporter_ids: [1, 2] }))).toHaveLength(0);
    expect(await validate(plainToInstance(ReplaceSupportersDto, {}))).not.toHaveLength(0);
    expect(await validate(plainToInstance(ReplaceSupportersDto, { supporter_ids: [1, 1] }))).not.toHaveLength(0);
  });

  it('create body no longer accepts supporter_ids (rejected by strict whitelist)', async () => {
    const errors = await validate(plainToInstance(CreatePromptPackageDto, { supporter_ids: [1] }), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(errors.map((e) => e.property)).toContain('supporter_ids');
  });
});
