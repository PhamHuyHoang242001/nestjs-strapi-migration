import { ForbiddenException } from '@nestjs/common';
import { CoworkerReuseMatrixService } from '../coworker-reuse-matrix.service';
import { CoworkerController } from '../coworker.controller';

function makeHarness(sqlResults: {
  columns?: Array<{ id: number; code: string; name: string }>;
  count?: number;
  skills?: Array<{ id: number; publisher_id: number; name: string; version_id: number }>;
  links?: Array<{ skill_version_id: number; coworker_package_id: number }>;
}) {
  const captured: Array<{ sql: string; params?: unknown[] }> = [];
  const query = jest.fn(async (sql: string, params?: unknown[]) => {
    captured.push({ sql, params });
    if (sql.includes('FROM coworker_packages')) return sqlResults.columns ?? [];
    if (sql.includes('COUNT(*)')) return [{ count: sqlResults.count ?? 0 }];
    if (sql.includes('FROM skill_packages')) return sqlResults.skills ?? [];
    if (sql.includes('FROM skill_version_coworkers')) return sqlResults.links ?? [];
    return [];
  });
  const metaRead = {
    getPublishersByIds: jest.fn().mockResolvedValue(new Map()),
  };
  const service = new CoworkerReuseMatrixService({ manager: { query } } as never, metaRead as never);
  return { service, query, captured, metaRead };
}

describe('CoworkerReuseMatrixService.getMatrix', () => {
  it('returns empty columns/rows when the catalog is empty', async () => {
    const { service, captured } = makeHarness({ columns: [], count: 0 });

    await expect(service.getMatrix({ page: 1, limit: 20 })).resolves.toEqual({
      columns: [],
      rows: [],
      meta: { total: 0, page: 1, limit: 20 },
    });
    expect(captured.some((c) => c.sql.includes('FROM skill_packages pkg') && c.sql.includes('LIMIT'))).toBe(false);
    expect(captured.some((c) => c.sql.includes('skill_version_coworkers'))).toBe(false);
  });

  it('aligns cells to column order — only the linked coworker ticks', async () => {
    const { service, metaRead } = makeHarness({
      columns: [
        { id: 1, code: 'cw-a', name: 'A' },
        { id: 2, code: 'cw-b', name: 'B' },
      ],
      count: 1,
      skills: [{ id: 10, publisher_id: 3, name: 'Skill X', version_id: 99 }],
      links: [{ skill_version_id: 99, coworker_package_id: 1 }],
    });
    metaRead.getPublishersByIds.mockResolvedValue(new Map([[3, { id: 3, name: 'Khối CNTT' }]]));

    const result = await service.getMatrix({ page: 1, limit: 20 });

    expect(result.columns).toEqual([
      { id: 1, code: 'cw-a', name: 'A' },
      { id: 2, code: 'cw-b', name: 'B' },
    ]);
    expect(result.rows).toEqual([
      {
        id: 10,
        name: 'Skill X',
        publisher: { id: 3, name: 'Khối CNTT' },
        cells: [true, false],
      },
    ]);
    expect(result.meta).toEqual({ total: 1, page: 1, limit: 20 });
  });

  it('ignores a link whose coworker_package_id is not a column', async () => {
    const { service } = makeHarness({
      columns: [{ id: 1, code: 'cw-a', name: 'A' }],
      count: 1,
      skills: [{ id: 10, publisher_id: 3, name: 'Skill X', version_id: 99 }],
      links: [{ skill_version_id: 99, coworker_package_id: 999 }],
    });

    const result = await service.getMatrix({ page: 1, limit: 20 });
    expect(result.rows[0].cells).toEqual([false]);
  });

  it('unknown publisher id → name null', async () => {
    const { service } = makeHarness({
      columns: [],
      count: 1,
      skills: [{ id: 10, publisher_id: 3, name: 'Skill X', version_id: 99 }],
    });

    const result = await service.getMatrix({ page: 1, limit: 20 });
    expect(result.rows[0].publisher).toEqual({ id: 3, name: null });
  });

  it('page 2 binds LIMIT/OFFSET from page and limit', async () => {
    const { service, captured } = makeHarness({
      columns: [],
      count: 3,
      skills: [{ id: 12, publisher_id: 3, name: 'Z', version_id: 7 }],
    });

    await service.getMatrix({ page: 2, limit: 1 });

    const pageSql = captured.find((c) => c.sql.includes('LIMIT $1 OFFSET $2'));
    expect(pageSql?.params).toEqual([1, 1]);
  });

  it('column SQL requires active live coworker packages with an active version', async () => {
    const { service, captured } = makeHarness({ columns: [], count: 0 });
    await service.getMatrix({});
    const col = captured.find((c) => c.sql.includes('FROM coworker_packages'));
    expect(col?.sql).toContain("cp.status = 'active'");
    expect(col?.sql).toContain('cp.active_version_id IS NOT NULL');
    expect(col?.sql).toContain('cp.deleted_at IS NULL');
    expect(col?.sql).toContain('INNER JOIN coworker_versions cv');
    expect(col?.sql).not.toContain('LEFT JOIN coworker_versions');
  });

  it('skill SQL requires active live packages with an active version', async () => {
    const { service, captured } = makeHarness({ columns: [], count: 1, skills: [] });
    await service.getMatrix({ page: 1, limit: 20 });
    const skill = captured.find((c) => c.sql.includes('FROM skill_packages') && c.sql.includes('LIMIT'));
    expect(skill?.sql).toContain("pkg.status = 'active'");
    expect(skill?.sql).toContain('pkg.active_version_id IS NOT NULL');
    expect(skill?.sql).toContain('pkg.deleted_at IS NULL');
  });

  it('join SQL filters live skill_version_coworkers only', async () => {
    const { service, captured } = makeHarness({
      columns: [{ id: 1, code: 'a', name: 'A' }],
      count: 1,
      skills: [{ id: 10, publisher_id: 3, name: 'X', version_id: 99 }],
      links: [],
    });
    await service.getMatrix({ page: 1, limit: 20 });
    const links = captured.find((c) => c.sql.includes('skill_version_coworkers'));
    expect(links?.sql).toContain('vt.deleted_at IS NULL');
    expect(links?.params).toEqual([[99]]);
  });
});

describe('CoworkerController.getReuseMatrix', () => {
  it('rejects an unauthenticated caller', async () => {
    const controller = new CoworkerController(
      {} as never,
      {} as never,
      {} as never,
      { getMatrix: jest.fn() } as never,
    );
    expect(() => controller.getReuseMatrix({}, { info: { user: {} } } as never)).toThrow(ForbiddenException);
  });

  it('passes the query DTO through to the matrix service', async () => {
    const reuseMatrix = { getMatrix: jest.fn().mockResolvedValue({ columns: [], rows: [], meta: {} }) };
    const controller = new CoworkerController({} as never, {} as never, {} as never, reuseMatrix as never);
    await controller.getReuseMatrix({ page: 2, limit: 10 }, { info: { user: { id: 7 } } } as never);
    expect(reuseMatrix.getMatrix).toHaveBeenCalledWith({ page: 2, limit: 10 });
  });
});
