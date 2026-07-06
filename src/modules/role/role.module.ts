import { PermissionRepository } from '@modules/permission/repository/permission.repository';
import { UserRole } from '@modules/databases/user-role.entity';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Role } from '../databases/role.entity';
import { RoleRepository } from './repository/role.repository';
import { RoleController } from './role.controller';
import { RoleService } from './role.service';
import { GroupRoleSyncService } from './group-role-sync.service';
import { GroupRoleMapping } from '@modules/databases/group-role-mapping.entity';
import { AdminRepository } from '@modules/admins/repository/admin.repository';
import { UserRepository } from '@modules/users/repository/users.repository';
import { ChangeHistoryModule } from '@modules/change-history/change-history.module';

@Module({
  imports: [TypeOrmModule.forFeature([Role, UserRole, GroupRoleMapping]), ChangeHistoryModule],
  controllers: [RoleController],
  providers: [
    RoleService,
    GroupRoleSyncService,
    RoleRepository,
    PermissionRepository,
    AdminRepository,
    UserRepository,
  ],
  exports: [RoleService, RoleRepository],
})
export class RoleModule {}
