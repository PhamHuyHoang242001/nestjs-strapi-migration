import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DataHubSystemQueryService } from '../data-hub-system-query.service';
import { DataHubPageQueryDto } from '../../common/data-hub-query.util';
import { ListSystemServiceQueryDto } from '../dto/list-system-service-query.dto';

function makeService(rows: unknown[]) {
  const query = jest.fn<Promise<unknown[]>, [string, unknown[]]>((sql) =>
    Promise.resolve(sql.includes('COUNT(*)') ? [{ total: 3 }] : rows),
  );
  return { service: new DataHubSystemQueryService({ query } as never), query };
}

describe('DataHubSystemQueryService', () => {
  it('lists live systems by name with paging and an escaped keyword', async () => {
    const { service, query } = makeService([{ id: '2', name: 'OCP' }]);
    const res = await service.listSystems({ keyword: ' 50%_off ', page: 2, limit: 5 } as DataHubPageQueryDto);

    expect(res).toEqual({ data: [{ id: 2, name: 'OCP' }], meta: { total: 3, page: 2, limit: 5 } });
    const [countSql, countParams] = query.mock.calls[0];
    const [rowSql, rowParams] = query.mock.calls[1];
    expect(countSql).toContain('s.deleted_at IS NULL AND s.is_deleted IS NOT TRUE');
    expect(countSql).toContain("s.name ILIKE $1 ESCAPE '\\'");
    expect(countParams).toEqual(['%50\\%\\_off%']);
    expect(rowSql).toContain('LIMIT $2 OFFSET $3');
    expect(rowParams).toEqual(['%50\\%\\_off%', 5, 5]);
  });

  it('lists services of live systems, filtered by system and keyword', async () => {
    const { service, query } = makeService([{ id: 7, name: 'Payment', system_id: 2, system_name: 'OCP' }]);
    const res = await service.listSystemServices({
      system_id: 2,
      keyword: 'pay',
      page: 1,
      limit: 10,
    } as ListSystemServiceQueryDto);

    expect(res.data).toEqual([{ id: 7, name: 'Payment', system: { id: 2, name: 'OCP' } }]);
    const [sql, params] = query.mock.calls[1];
    expect(sql).toContain('sv.deleted_at IS NULL AND sv.is_deleted IS NOT TRUE');
    expect(sql).toContain('s.deleted_at IS NULL AND s.is_deleted IS NOT TRUE');
    expect(sql).toContain('sv.system_id = $1');
    expect(sql).toContain("sv.name ILIKE $2 ESCAPE '\\'");
    expect(params).toEqual([2, '%pay%', 10, 0]);
  });

  it('without filters lists every live service, first page of 10', async () => {
    const { service, query } = makeService([]);
    const res = await service.listSystemServices({} as ListSystemServiceQueryDto);
    expect(res.meta).toEqual({ total: 3, page: 1, limit: 10 });
    expect(query.mock.calls[1][1]).toEqual([10, 0]);
  });

  it('service query: system_id is an optional positive int, paging comes from the base DTO', async () => {
    expect(await validate(plainToInstance(ListSystemServiceQueryDto, { system_id: '2', page: '1' }))).toHaveLength(0);
    const bad = await validate(plainToInstance(ListSystemServiceQueryDto, { system_id: '0', limit: '500' }));
    expect(bad.map((e) => e.property).sort()).toEqual(['limit', 'system_id']);
  });
});
