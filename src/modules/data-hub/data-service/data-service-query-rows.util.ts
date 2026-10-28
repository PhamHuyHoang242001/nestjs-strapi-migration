import { EntityManager } from 'typeorm';

// TypeORM's raw `query` returns `any`; this pins each call site to an explicit row type so column names that
// leave SQL are checked by the compiler instead of silently flowing through as `any`.
export async function queryRows<T>(
  runner: Pick<EntityManager, 'query'>,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return runner.query(sql, params);
}
