import { SelectQueryBuilder } from 'typeorm';

export function applyDataAccessScope<T>(
  qb: SelectQueryBuilder<T>,
  alias: string,
  accessibleIds: number[] | undefined,
): SelectQueryBuilder<T> {
  if (accessibleIds === undefined) return qb;
  if (accessibleIds.length === 0) return qb.andWhere('1 = 0');
  return qb.andWhere(`${alias}.id IN (:...accessibleIds)`, { accessibleIds });
}
