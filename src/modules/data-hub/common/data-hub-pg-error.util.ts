import { QueryFailedError } from 'typeorm';

// Postgres unique_violation, optionally narrowed to one constraint / index name.
export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  if (!(err instanceof QueryFailedError)) return false;
  const driverError = (err as QueryFailedError & { driverError?: { code?: string; constraint?: string } }).driverError;
  if (driverError?.code !== '23505') return false;
  return constraint === undefined || driverError.constraint === constraint;
}
