import { makeSqlMock, SqlHandler } from '../../dictionary/__tests__/dictionary-test-helpers';
import { DepartmentConfigQueryService } from '../department-config-query.service';

const userRefs = {
  resolve: jest.fn().mockResolvedValue(new Map([[11, { id: 11, email: 'a@x.vn' }]])),
  toRef: (m: Map<number, unknown>, id: number | null) =>
    id === null || id === undefined ? null : (m.get(id) ?? { id, email: null }),
};

const make = (handlers: SqlHandler[], access: Record<string, jest.Mock>) => {
  const mock = makeSqlMock(handlers);
  return {
    ...mock,
    service: new DepartmentConfigQueryService(mock.dataSource as never, userRefs as never, access as never),
  };
};

describe('DepartmentConfigQueryService', () => {
  it('detail annotates every member with its current data-service rights', async () => {
    const dataServiceRights = jest
      .fn()
      .mockResolvedValueOnce({ can_create: true, can_update: false })
      .mockResolvedValueOnce({ can_create: false, can_update: false });
    const { service } = make(
      [
        [/FROM data_hub_departments d WHERE d.id = \$1/, () => [{ id: 5, code: 'DPD', name: 'n', created_by: null }]],
        [/FROM data_hub_department_members m WHERE m.department_id/, () => [{ user_id: 11 }, { user_id: 12 }]],
      ],
      { dataServiceRights },
    );
    const res = await service.detail(5);
    expect(res.members).toEqual([
      { id: 11, email: 'a@x.vn', can_create: true, can_update: false },
      { id: 12, email: null, can_create: false, can_update: false },
    ]);
    expect(dataServiceRights).toHaveBeenCalledWith(11);
  });

  it('detail 404 on a missing department', async () => {
    await expect(make([], {}).service.detail(5)).rejects.toThrow('DEPARTMENT_NOT_FOUND');
  });

  it('writable: [] short-circuits, null (super_admin) lists every live department, ids filter otherwise', async () => {
    const rows = [/FROM data_hub_departments d/, () => [{ id: 1, code: 'DPD', name: 'n' }]] as SqlHandler;
    const none = make([rows], { writableDepartmentIds: jest.fn().mockResolvedValue([]) });
    await expect(none.service.writable({ id: 7 }, 'create')).resolves.toEqual({ data: [] });
    expect(none.calls).toHaveLength(0);

    const all = make([rows], { writableDepartmentIds: jest.fn().mockResolvedValue(null) });
    await all.service.writable({ id: 1, type: 'super_admin' }, 'update');
    expect(all.calls[0].sql).not.toContain('ANY($1)');

    const some = make([rows], { writableDepartmentIds: jest.fn().mockResolvedValue([1, 2]) });
    await expect(some.service.writable({ id: 7 }, 'create')).resolves.toEqual({
      data: [{ id: 1, code: 'DPD', name: 'n' }],
    });
    expect(some.calls[0].params).toEqual([[1, 2]]);
  });

  it('candidates exclude current members and search by email', async () => {
    const { service, calls } = make(
      [
        [/SELECT 1 FROM data_hub_departments/, () => [{}]],
        [/COUNT\(DISTINCT u.id\)/, () => [{ total: 1 }]],
        [/bool_or/, () => [{ id: 11, email: 'a@x.vn', can_create: true, can_update: null }]],
      ],
      {},
    );
    const res = await service.candidates(5, { keyword: 'a_', page: 1, limit: 10 } as never);
    expect(res).toEqual({
      data: [{ id: 11, email: 'a@x.vn', can_create: true, can_update: false }],
      meta: { total: 1, page: 1, limit: 10 },
    });
    const sql = calls[2].sql;
    expect(sql).toContain('NOT EXISTS (SELECT 1 FROM data_hub_department_members m WHERE m.department_id = $2');
    expect(sql).toContain("da.scope_type = 'allow'");
    expect(calls[2].params.slice(1)).toEqual([5, '%a\\_%', 'dh_data_service_create', 'dh_data_service_update', 10, 0]);
    // Postgres rejects a bound parameter the statement never references, so each query binds only what it uses
    for (const c of calls.slice(1)) {
      const used = new Set([...c.sql.matchAll(/\$(\d+)/g)].map((m) => Number(m[1])));
      expect(Math.max(...used)).toBe(c.params.length);
      expect(used.size).toBe(c.params.length);
    }
  });
});
