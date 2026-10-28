import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { BaseSearchDto } from '@common/dto/common.dto';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { QueryFailedError } from 'typeorm';
import { DataHubUserRefService } from '../data-hub-user-ref.service';
import {
  DataHubPageQueryDto,
  escapeLike,
  liveSql,
  searchTerm,
  toNumberArray,
  toPaging,
  toStringArray,
} from '../data-hub-query.util';
import { isUniqueViolation } from '../data-hub-pg-error.util';
import { DataHubOrgService } from '../data-hub-org.service';
import { DataHubOrgController } from '../data-hub-org.controller';

describe('DataHubUserRefService', () => {
  const makeService = (rows: Array<{ id: number; email: string | null }>) => {
    const query = jest.fn<Promise<unknown>, [string, unknown[]?]>().mockResolvedValue(rows);
    const service = new DataHubUserRefService({ manager: { query } } as never);
    return { service, query };
  };

  it('resolves ids in one batched query selecting only id + email', async () => {
    const { service, query } = makeService([{ id: 7, email: 'a@vpbank.com.vn' }]);
    const map = await service.resolve([7, 7, null, undefined, 8]);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toBe('SELECT id, email FROM users WHERE id = ANY($1)');
    expect(query.mock.calls[0][1]).toEqual([[7, 8]]);
    expect(service.toRef(map, 7)).toEqual({ id: 7, email: 'a@vpbank.com.vn' });
  });

  it('unknown id keeps the id with email null; null id → null', async () => {
    const { service } = makeService([]);
    const map = await service.resolve([9]);
    expect(service.toRef(map, 9)).toEqual({ id: 9, email: null });
    expect(service.toRef(map, null)).toBeNull();
  });

  it('skips the query when there is nothing to resolve', async () => {
    const { service, query } = makeService([]);
    await service.resolve([null]);
    expect(query).not.toHaveBeenCalled();
  });

  it('assertUsers rejects when any id is not a live user', async () => {
    const { service } = makeService([]);
    const manager = { query: jest.fn<Promise<unknown>, [string, unknown[]?]>().mockResolvedValue([{ id: 1 }]) };
    await expect(service.assertUsers(manager as never, [1, 2])).rejects.toThrow(BadRequestException);
    expect(manager.query.mock.calls[0][0]).toContain('deleted_at IS NULL');
    await expect(service.assertUsers(manager as never, [1, 1])).resolves.toBeUndefined();
  });
});

describe('data-hub-query.util', () => {
  it('liveSql checks both soft-delete columns', () => {
    expect(liveSql('s')).toBe('s.deleted_at IS NULL AND s.is_deleted IS NOT TRUE');
  });

  it('escapeLike escapes wildcards and backslash', () => {
    expect(escapeLike('50%_a\\b')).toBe('50\\%\\_a\\\\b');
  });

  it('array transforms accept csv and repeated params', () => {
    expect(toNumberArray({ value: '1,2' })).toEqual([1, 2]);
    expect(toNumberArray({ value: ['3', '4,5'] })).toEqual([3, 4, 5]);
    expect(toStringArray({ value: 'API, SFTP' })).toEqual(['API', 'SFTP']);
    expect(toStringArray({ value: '' })).toBeUndefined();
  });

  it('toPaging defaults and offset; searchTerm trims blanks away', () => {
    expect(toPaging({})).toEqual({ page: 1, limit: 10, offset: 0 });
    expect(toPaging({ page: 3, limit: 10 })).toEqual({ page: 3, limit: 10, offset: 20 });
    expect(searchTerm('  ')).toBeUndefined();
    expect(searchTerm(' x ')).toBe('x');
  });
});

describe('isUniqueViolation', () => {
  const pgErr = (code: string, constraint?: string) =>
    Object.assign(new QueryFailedError('q', [], new Error('x')), { driverError: { code, constraint } });

  it('matches 23505, optionally by constraint name', () => {
    expect(isUniqueViolation(pgErr('23505', 'uq_a'))).toBe(true);
    expect(isUniqueViolation(pgErr('23505', 'uq_a'), 'uq_a')).toBe(true);
    expect(isUniqueViolation(pgErr('23505', 'uq_a'), 'uq_b')).toBe(false);
    expect(isUniqueViolation(pgErr('23503'))).toBe(false);
    expect(isUniqueViolation(new Error('x'))).toBe(false);
  });
});

describe('DataHubOrgService / controller', () => {
  const makeService = () => {
    const query = jest
      .fn<Promise<unknown>, [string]>()
      .mockImplementation((sql: string) =>
        Promise.resolve(
          sql.includes('data_hub_request_units')
            ? [{ id: '3', code: 'DBS', name: 'DBS', category: null }]
            : [{ id: '1', code: 'EDA', name: 'EDA' }],
        ),
      );
    return { service: new DataHubOrgService({ query } as never), query };
  };

  it('each list selects only its columns from live rows and returns { data }', async () => {
    const { service, query } = makeService();
    await expect(service.listDivisions()).resolves.toEqual({ data: [{ id: 1, code: 'EDA', name: 'EDA' }] });
    await expect(service.listDepartments()).resolves.toEqual({ data: [{ id: 1, code: 'EDA', name: 'EDA' }] });
    await expect(service.listRequestUnits()).resolves.toEqual({
      data: [{ id: 3, code: 'DBS', name: 'DBS', category: null }],
    });
    const sqls = query.mock.calls.map(([sql]) => sql);
    expect(sqls[0]).toContain('FROM data_hub_divisions');
    expect(sqls[1]).toContain('FROM data_hub_departments');
    expect(sqls[2]).toContain('t.id, t.code, t.name, t.category FROM data_hub_request_units');
    for (const sql of sqls) {
      expect(sql).not.toContain('*');
      expect(sql).toContain('t.deleted_at IS NULL');
    }
  });

  it('controller rejects an unauthenticated caller on every list', () => {
    const controller = new DataHubOrgController({} as never);
    const req = { info: { user: {} } } as never;
    expect(() => controller.listDivisions(req)).toThrow(ForbiddenException);
    expect(() => controller.listDepartments(req)).toThrow(ForbiddenException);
    expect(() => controller.listRequestUnits(req)).toThrow(ForbiddenException);
  });
});

describe('DataHubPageQueryDto', () => {
  const errorsOf = (plain: Record<string, unknown>) =>
    validateSync(plainToInstance(DataHubPageQueryDto, plain), { whitelist: true, forbidNonWhitelisted: true }).map(
      (e) => e.property,
    );

  it('extends BaseSearchDto: keyword / page / limit come from the shared base', () => {
    const dto = plainToInstance(DataHubPageQueryDto, { keyword: ' cif ', page: '2', limit: '5' });
    expect(dto).toBeInstanceOf(BaseSearchDto);
    expect(dto).toMatchObject({ keyword: 'cif', page: 2, limit: 5 });
    expect(errorsOf({ keyword: 'cif', page: '2', limit: '5' })).toEqual([]);
  });

  it('keeps page >= 1 and limit 1..100; the old `search` param is rejected', () => {
    expect(errorsOf({ page: '0' })).toEqual(['page']);
    expect(errorsOf({ limit: '101' })).toEqual(['limit']);
    expect(errorsOf({ search: 'x' })).toEqual(['search']);
  });
});
