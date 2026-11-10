import { DataHubSystemQueryService } from '../data-hub-system-query.service';
import { DataHubPageQueryDto } from '../../common/data-hub-query.util';

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

  it('lists live owner units by name from their own table, with the same paging', async () => {
    const { service, query } = makeService([{ id: '4', name: 'Khối Vận hành' }]);
    const res = await service.listOwnerUnits({} as DataHubPageQueryDto);
    expect(res).toEqual({ data: [{ id: 4, name: 'Khối Vận hành' }], meta: { total: 3, page: 1, limit: 10 } });
    const [countSql] = query.mock.calls[0];
    const [rowSql, rowParams] = query.mock.calls[1];
    expect(countSql).toContain('FROM data_hub_owner_units s WHERE s.deleted_at IS NULL AND s.is_deleted IS NOT TRUE');
    expect(rowSql).toContain('FROM data_hub_owner_units s');
    expect(rowParams).toEqual([10, 0]);
  });
});
