import { applyDataAccessScope } from '../helpers/data-access-scope.helper';
import { SelectQueryBuilder } from 'typeorm';

describe('applyDataAccessScope', () => {
  const qb = () => ({ andWhere: jest.fn().mockReturnThis() });

  it('does not modify the query when accessible ids are undefined', () => {
    const query = qb();

    expect(applyDataAccessScope(query as unknown as SelectQueryBuilder<unknown>, 'report', undefined)).toBe(query);
    expect(query.andWhere).not.toHaveBeenCalled();
  });

  it('adds impossible condition for empty access', () => {
    const query = qb();

    applyDataAccessScope(query as unknown as SelectQueryBuilder<unknown>, 'report', []);
    expect(query.andWhere).toHaveBeenCalledWith('1 = 0');
  });

  it('adds id scope for accessible ids', () => {
    const query = qb();

    applyDataAccessScope(query as unknown as SelectQueryBuilder<unknown>, 'report', [1, 2]);
    expect(query.andWhere).toHaveBeenCalledWith('report.id IN (:...accessibleIds)', { accessibleIds: [1, 2] });
  });
});
