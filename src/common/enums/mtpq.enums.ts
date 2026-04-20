export enum SCOPE_TYPE {
  ALLOW = 'allow',
  DENY = 'deny',
}

export enum CHANGE_ENTITY_TYPE {
  ROLE = 'role',
  USER = 'user',
  ROLE_USER = 'role_user',
  PERMISSION = 'permission',
  DATA_ACCESS = 'data_access',
  SYSTEM = 'system',
}

export enum CHANGE_ACTION_TYPE {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  CLONE = 'clone',
  ASSIGN_USER = 'assign_user',
  REMOVE_USER = 'remove_user',
  ACTIVATE = 'activate',
  DEACTIVATE = 'deactivate',
}
