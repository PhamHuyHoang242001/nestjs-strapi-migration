import { applyPicAndUpdatedByFilters } from './diagnostic-report-format.helper';

// Shared picIds / updatedByIds filter used by both findAll (list) and download (Excel).
describe('applyPicAndUpdatedByFilters', () => {
  const buildQb = () => {
    const calls: Array<{ sql: any; params: any }> = [];
    const qb: any = {
      calls,
      andWhere: jest.fn((sql: any, params: any) => {
        calls.push({ sql, params });
        return qb;
      }),
    };
    return qb;
  };

  it('adds an EXISTS(pics) clause for picIds and an IN clause for updatedByIds', () => {
    const qb = buildQb();
    applyPicAndUpdatedByFilters(qb, { picIds: '1,2,3', updatedByIds: '4,5' });

    const picClause = qb.calls.find((c: any) => String(c.sql).includes('bi_hub_diagnostic_report_pics'));
    expect(picClause).toBeDefined();
    expect(picClause.params).toEqual({ picIds: [1, 2, 3] });

    const updClause = qb.calls.find((c: any) => String(c.sql).includes('updated_by_admin_id'));
    expect(updClause).toBeDefined();
    expect(updClause.params).toEqual({ updatedByIds: [4, 5] });
  });

  it('adds no clause when both are omitted', () => {
    const qb = buildQb();
    applyPicAndUpdatedByFilters(qb, {});
    expect(qb.andWhere).not.toHaveBeenCalled();
  });

  it('drops empty/zero ids and skips a clause that ends up empty', () => {
    const qb = buildQb();
    applyPicAndUpdatedByFilters(qb, { picIds: '0,,', updatedByIds: '7' });

    expect(qb.calls.find((c: any) => String(c.sql).includes('bi_hub_diagnostic_report_pics'))).toBeUndefined();
    const updClause = qb.calls.find((c: any) => String(c.sql).includes('updated_by_admin_id'));
    expect(updClause.params).toEqual({ updatedByIds: [7] });
  });
});
