import { AssetHubUserDirectoryService } from '../asset-hub-user-directory.service';

interface CapturedWhere {
  clause: string;
  params?: Record<string, unknown>;
}

function makeQb(rows: Array<{ id: number; email: string }>, total: number) {
  const wheres: CapturedWhere[] = [];
  const calls = { skip: 0, take: 0 };
  const qb: Record<string, jest.Mock> = {
    select: jest.fn(() => qb),
    where: jest.fn((clause: string, params?: Record<string, unknown>) => {
      wheres.push({ clause, params });
      return qb;
    }),
    andWhere: jest.fn((clause: string, params?: Record<string, unknown>) => {
      wheres.push({ clause, params });
      return qb;
    }),
    orderBy: jest.fn(() => qb),
    skip: jest.fn((n: number) => {
      calls.skip = n;
      return qb;
    }),
    take: jest.fn((n: number) => {
      calls.take = n;
      return qb;
    }),
    getManyAndCount: jest.fn(() => Promise.resolve([rows, total])),
  };
  return { qb, wheres, calls };
}

const makeService = (qb: Record<string, jest.Mock>) =>
  new AssetHubUserDirectoryService({ createQueryBuilder: () => qb } as never);

describe('AssetHubUserDirectoryService', () => {
  it('returns a full page with no keyword — search is a filter, not a precondition', async () => {
    const { qb, wheres } = makeQb([{ id: 3, email: 'a@x.vn' }], 57);

    const result = await makeService(qb).list({});

    expect(result).toEqual({ data: [{ id: 3, email: 'a@x.vn' }], meta: { total: 57, page: 1, limit: 20 } });
    expect(wheres.some((w) => w.clause.includes('ILIKE'))).toBe(false);
  });

  it('binds the keyword as a parameter rather than interpolating it', async () => {
    const { qb, wheres } = makeQb([], 0);

    await makeService(qb).list({ search: "o'brien" });

    const ilike = wheres.find((w) => w.clause.includes('ILIKE'));
    expect(ilike?.clause).toBe('u.email ILIKE :search');
    expect(ilike?.params).toEqual({ search: "%o'brien%" });
    expect(ilike?.clause).not.toContain("o'brien");
  });

  it('ignores a whitespace-only keyword', async () => {
    const { qb, wheres } = makeQb([], 0);

    await makeService(qb).list({ search: '   ' });

    expect(wheres.some((w) => w.clause.includes('ILIKE'))).toBe(false);
  });

  it('excludes soft-deleted users and rows without an email', async () => {
    const { qb, wheres } = makeQb([], 0);

    await makeService(qb).list({});

    const clauses = wheres.map((w) => w.clause);
    expect(clauses).toContain('u.deleted_at IS NULL');
    expect(clauses).toContain('COALESCE(u.is_deleted, false) = false');
    expect(clauses).toContain('u.email IS NOT NULL');
  });

  it('paginates by page/limit', async () => {
    const { qb, calls } = makeQb([], 0);

    await makeService(qb).list({ page: 3, limit: 25 });

    expect(calls.skip).toBe(50);
    expect(calls.take).toBe(25);
  });

  it('echoes the requested page and limit in meta', async () => {
    const { qb } = makeQb([], 120);

    const result = await makeService(qb).list({ page: 2, limit: 50 });

    expect(result.meta).toEqual({ total: 120, page: 2, limit: 50 });
  });
});
