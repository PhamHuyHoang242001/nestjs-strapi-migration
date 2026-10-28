import { DataSource, EntityManager } from 'typeorm';

// Typed wrapper over raw queries so row shapes are declared once at the call site
// instead of leaking `any` from the driver.
export async function sqlRows<T>(
  runner: DataSource | EntityManager,
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const rows: T[] = await runner.query(text, params);
  return rows;
}
