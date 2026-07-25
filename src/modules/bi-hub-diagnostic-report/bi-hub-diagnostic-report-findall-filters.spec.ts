import { BiHubDiagnosticReportService } from './bi-hub-diagnostic-report.service';

// findAll: picIds / updatedByIds filters (comma-separated id lists).
describe('BiHubDiagnosticReportService.findAll filters', () => {
  const buildQb = () => {
    const calls: Array<{ sql: any; params: any }> = [];
    const qb: any = {
      andWhereCalls: calls,
      leftJoinAndSelect: jest.fn(() => qb),
      where: jest.fn(() => qb),
      andWhere: jest.fn((sql: any, params: any) => {
        calls.push({ sql, params });
        return qb;
      }),
      orderBy: jest.fn(() => qb),
      skip: jest.fn(() => qb),
      take: jest.fn(() => qb),
      getMany: jest.fn().mockResolvedValue([]),
      getCount: jest.fn().mockResolvedValue(0),
    };
    return qb;
  };

  const buildService = (qb: any) => {
    const reportRepo = { createQueryBuilder: jest.fn(() => qb) };
    const picService = {
      getPicsByReportIds: jest.fn().mockResolvedValue(new Map()),
      getSupportersByReportIds: jest.fn().mockResolvedValue(new Map()),
    };
    return new BiHubDiagnosticReportService(
      reportRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      picService as any,
    );
  };

  it('adds picIds (EXISTS on pics table) and updatedByIds filters', async () => {
    const qb = buildQb();
    const svc = buildService(qb);

    await svc.findAll({ picIds: '1,2,3', updatedByIds: '4,5' } as any, null);

    const picClause = qb.andWhereCalls.find((c: any) => String(c.sql).includes('bi_hub_diagnostic_report_pics'));
    expect(picClause).toBeDefined();
    expect(picClause.params).toEqual({ picIds: [1, 2, 3] });

    const updClause = qb.andWhereCalls.find((c: any) => String(c.sql).includes('updated_by_admin_id'));
    expect(updClause).toBeDefined();
    expect(updClause.params).toEqual({ updatedByIds: [4, 5] });
  });

  it('skips both filters when not provided', async () => {
    const qb = buildQb();
    const svc = buildService(qb);

    await svc.findAll({} as any, null);

    expect(qb.andWhereCalls.find((c: any) => String(c.sql).includes('bi_hub_diagnostic_report_pics'))).toBeUndefined();
    expect(qb.andWhereCalls.find((c: any) => String(c.sql).includes('updated_by_admin_id'))).toBeUndefined();
  });

  it('ignores non-numeric / empty ids (filtered out)', async () => {
    const qb = buildQb();
    const svc = buildService(qb);

    // "0" is falsy → dropped; only valid ids kept, and an all-empty list adds no clause.
    await svc.findAll({ picIds: '0,,', updatedByIds: '7' } as any, null);

    expect(qb.andWhereCalls.find((c: any) => String(c.sql).includes('bi_hub_diagnostic_report_pics'))).toBeUndefined();
    const updClause = qb.andWhereCalls.find((c: any) => String(c.sql).includes('updated_by_admin_id'));
    expect(updClause.params).toEqual({ updatedByIds: [7] });
  });
});
