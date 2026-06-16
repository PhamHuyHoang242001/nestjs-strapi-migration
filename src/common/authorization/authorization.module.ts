import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoleDataAccess, UserDataAccess } from '@modules/databases/data-access.entity';
import { UserRole } from '@modules/databases/user-role.entity';
import { DataAccessInterceptor } from './interceptors/data-access.interceptor';
import { OwnerScopeGuard } from './guards/owner-scope.guard';
import { PermissionGuard } from './guards/permission.guard';
import { OwnerScopeResolverService } from './services/owner-scope-resolver.service';
import { PermissionCacheService } from './services/permission-cache.service';
import { PermissionQueryService } from './services/permission-query.service';

// Guard order (LOCKED — see plan Red Team H6):
//   JwtAuthGuard → PermissionGuard → OwnerScopeGuard → DataAccessInterceptor
// PermissionGuard gates the verb (incl. impliedVerbs). OwnerScopeGuard then enforces
// per-target ownership for write endpoints. Interceptor populates `req.info.dataScope`
// (explicit grants + owned roots + denies) consumed by services via applyDataScope().
// Apply at controller level via @UseGuards(...) in this exact order.
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([UserRole, UserDataAccess, RoleDataAccess])],
  providers: [
    PermissionQueryService,
    PermissionCacheService,
    OwnerScopeResolverService,
    PermissionGuard,
    OwnerScopeGuard,
    DataAccessInterceptor,
  ],
  exports: [
    PermissionQueryService,
    PermissionCacheService,
    OwnerScopeResolverService,
    PermissionGuard,
    OwnerScopeGuard,
    DataAccessInterceptor,
  ],
})
export class AuthorizationModule {}
