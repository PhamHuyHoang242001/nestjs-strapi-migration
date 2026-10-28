// Fake SQL executor: first matching handler answers; every call is recorded for assertions.
export type SqlHandler = [RegExp, (params: unknown[]) => unknown];

export function makeSqlMock(handlers: SqlHandler[]) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const query = jest.fn((sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    const hit = handlers.find(([re]) => re.test(sql));
    return Promise.resolve(hit ? hit[1](params) : []);
  });
  const manager = { query };
  const dataSource = {
    query,
    manager,
    transaction: (cb: (m: typeof manager) => Promise<unknown>) => cb(manager),
  };
  return { calls, query, manager, dataSource };
}

export const userRefsStub = {
  resolve: jest.fn().mockResolvedValue(new Map()),
  toRef: (_m: unknown, id: number | null) => (id === null ? null : { id, email: `u${id}@x.vn` }),
};
