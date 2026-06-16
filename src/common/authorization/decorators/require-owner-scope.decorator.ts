import { SetMetadata } from '@nestjs/common';
import { OWNER_SCOPE_META_KEY } from '../constants/authorization.constant';

/**
 * Resolves the target record (or its parent) the request operates on, then
 * lets OwnerScopeGuard check whether it walks up to a root the caller owns.
 *
 * Use exactly one of `scopeFromBody` or `scopeFromParam`:
 *   - scopeFromBody: body field is the resource id of `table`
 *                    (e.g. POST { bicc_department_id: 1 } with table='bi_hub_bicc_departments')
 *   - scopeFromParam: URL param names the record id; guard loads record from `table`,
 *                     then walks hierarchy up to root.
 *
 * `table` is the table the field/param identifies (NOT necessarily the root table).
 */
export interface OwnerScopeMeta {
  table: string;
  scopeFromBody?: string;
  scopeFromParam?: string;
}

export const RequireOwnerScope = (meta: OwnerScopeMeta) => SetMetadata(OWNER_SCOPE_META_KEY, meta);
