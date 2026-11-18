export const PERMISSION_META_KEY = 'authorization:required_permissions';
export const DATA_ACCESS_META_KEY = 'authorization:data_access';
export const OWNER_SCOPE_META_KEY = 'authorization:owner_scope';
export const SKIP_PORTAL_PERMISSION_META_KEY = 'authorization:skip_portal_permission';

// Base permission every portal user needs: BearerGuard rejects any user-token request without it
// (super_admin excepted). Routes a locked-out user still needs opt out with @SkipPortalPermission().
export const PORTAL_VIEW_PERMISSION = 'view_portal';

export const permissionCacheKey = (userId: number) => `perm:user:${userId}:codes`;

export const dataAccessCacheKey = (userId: number, tableName: string, permissionCode?: string) =>
  permissionCode ? `perm:user:${userId}:da:${tableName}:${permissionCode}` : `perm:user:${userId}:da:${tableName}`;

export const PERMISSION_CACHE_TTL = 300;
export const DATA_ACCESS_CACHE_TTL = 120;

// Owner-scope cache (Red Team H3: lives ONLY in Redis, no in-process memo)
export const OWNER_SCOPE_CACHE_TTL = 120;
export const userOwnerScopeKey = (userId: number) => `perm:user:${userId}:owner_scope`;
export const userImpliedVerbsKey = (userId: number) => `perm:user:${userId}:owner_verbs`;
