import { SetMetadata } from '@nestjs/common';
import { DATA_ACCESS_META_KEY } from '../constants/authorization.constant';

export interface DataAccessMeta {
  tableName: string;
  permissionCode?: string;
}

export const RequireDataAccess = (tableName: string, permissionCode?: string) =>
  SetMetadata(DATA_ACCESS_META_KEY, { tableName, permissionCode } as DataAccessMeta);
