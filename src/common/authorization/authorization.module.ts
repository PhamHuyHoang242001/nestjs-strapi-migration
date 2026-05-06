import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoleDataAccess, UserDataAccess } from '@modules/databases/data-access.entity';
import { UserRole } from '@modules/databases/user-role.entity';
import { DataAccessInterceptor } from './interceptors/data-access.interceptor';
import { PermissionGuard } from './guards/permission.guard';
import { PermissionCacheService } from './services/permission-cache.service';
import { PermissionQueryService } from './services/permission-query.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([UserRole, UserDataAccess, RoleDataAccess])],
  providers: [PermissionQueryService, PermissionCacheService, PermissionGuard, DataAccessInterceptor],
  exports: [PermissionQueryService, PermissionCacheService, PermissionGuard, DataAccessInterceptor],
})
export class AuthorizationModule {}
