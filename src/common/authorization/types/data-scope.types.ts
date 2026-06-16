/**
 * Per-request authorization scope shape consumed by the SQL helper
 * `applyDataScope()`. Built by `DataAccessInterceptor`, attached to
 * `req.info.dataScope`, then forwarded to service methods.
 *
 * Predicate emitted: `explicit OR owner_branch`.
 * Owner branch is additive and immune to record-level deny — deny rules only
 * subtract from the explicit grants set inside `getAccessibleRecords()`.
 * `null` is reserved for legacy callers/contracts that pre-date this shape;
 * the current interceptor always builds an object for authenticated users.
 */
export interface DataScope {
  /**
   * Bounded list of record IDs the user has explicit access to,
   * already net of admin allow/deny grants (`allow_role ∪ allow_user`
   * minus `deny_role ∪ deny_user`).
   */
  explicit: number[];

  /**
   * Root IDs the user owns via `resource_owners`. The helper walks
   * the hierarchy chain from `tableName` up to `rootTable` and emits
   * an `EXISTS` subquery scoped to these IDs.
   *
   * `null` when the user has no owner role for this hierarchy root.
   */
  ownedRoots: { rootTable: string; rootIds: number[] } | null;
}
