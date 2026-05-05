export const PERMISSION_META_KEY = 'authorization:required_permissions';
export const DATA_ACCESS_META_KEY = 'authorization:data_access';

export const REDIS_PERM_PREFIX = 'perm:user';

export const permissionCacheKey = (userId: number) => `${REDIS_PERM_PREFIX}:${userId}:codes`;

export const dataAccessCacheKey = (userId: number, tableName: string, permissionCode?: string) =>
  permissionCode
    ? `${REDIS_PERM_PREFIX}:${userId}:da:${tableName}:${permissionCode}`
    : `${REDIS_PERM_PREFIX}:${userId}:da:${tableName}`;

export const PERMISSION_CACHE_TTL = 300;
export const DATA_ACCESS_CACHE_TTL = 120;
export const EMPTY_SET_SENTINEL = '__EMPTY__';
