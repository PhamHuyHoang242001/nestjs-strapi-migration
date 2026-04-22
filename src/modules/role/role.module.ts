import { PermissionRepository } from '@modules/permission/repository/permission.repository';
import { UserRole } from '@modules/databases/user-role.entity';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Role } from '../databases/role.entity';
import { RoleRepository } from './repository/role.repository';
import { RoleController } from './role.controller';
import { RoleService } from './role.service';
import { AdminRepository } from '@modules/admins/repository/admin.repository';
import { UserRepository } from '@modules/users/repository/users.repository';

@Module({
  imports: [TypeOrmModule.forFeature([Role, UserRole])],
  controllers: [RoleController],
  providers: [RoleService, RoleRepository, PermissionRepository, AdminRepository, UserRepository],
  exports: [RoleService, RoleRepository],
})
export class RoleModule {}
