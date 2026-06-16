import { Request } from 'express';
import type { DataScope } from '@common/authorization/types/data-scope.types';

/** Shape of the `req.info` object populated by guards/middleware */
export interface RequestInfo {
  device_hash?: string;
  language?: string;
  client?: string | null;
  user?: Record<string, unknown>;
  ip?: string;
  domain?: string;
  host?: string;
  url?: string;
  /**
   * Per-request authorization scope set by DataAccessInterceptor.
   * `null` on admin path; consumer forwards to service which feeds applyDataScope().
   */
  dataScope?: DataScope | null;

  /**
   * Set by PermissionGuard.
   *   true       — every required verb resolved via role.permissions (or super_admin).
   *   false      — at least one required verb came via SO implied path.
   *   undefined  — endpoint has no @RequirePermission, so PermissionGuard did not set it.
   * Read by OwnerScopeGuard: true → bypass owned-scope check (explicit-verb users keep
   * record-level filtering at the service layer via dataScope).
   */
  verbFromExplicit?: boolean;

  [key: string]: unknown;
}

/** Express Request extended with the custom `info` property set by guards */
export interface RequestWithInfo extends Request {
  info: RequestInfo;
}
