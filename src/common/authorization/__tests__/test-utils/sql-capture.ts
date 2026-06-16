import type { Logger } from 'typeorm';

/**
 * TypeORM Logger that captures emitted SQL strings into an in-memory array.
 * Used by integration specs to assert SQL shape (e.g. presence of `EXISTS (`)
 * as a regression guard against helper revert to IN-list patterns.
 *
 * Plug into a DataSource via `dataSource.setOptions({ logger, logging: ['query'] })`.
 */
export class SqlCaptureLogger implements Logger {
  queries: string[] = [];

  logQuery(query: string): void {
    this.queries.push(query);
  }
  logQueryError(): void {}
  logQuerySlow(): void {}
  logSchemaBuild(): void {}
  logMigration(): void {}
  log(): void {}

  reset(): void {
    this.queries = [];
  }
}
