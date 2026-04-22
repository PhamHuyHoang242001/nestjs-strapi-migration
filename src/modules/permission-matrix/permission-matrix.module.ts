import { Module as NestModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Role } from '@modules/databases/role.entity';
import { Permission } from '@modules/databases/permission.entity';
import { Module } from '@modules/databases/module.entity';
import { RoleRepository } from '@modules/role/repository/role.repository';
import { PermissionRepository } from '@modules/permission/repository/permission.repository';
import { ModuleManagementRepository } from '@modules/module/repository/module-management.repository';
import { AdminRepository } from '@modules/admins/repository/admin.repository';
import { PermissionMatrixController } from './permission-matrix.controller';
import { PermissionMatrixService } from './permission-matrix.service';

@NestModule({
  imports: [TypeOrmModule.forFeature([Role, Permission, Module])],
  controllers: [PermissionMatrixController],
  providers: [PermissionMatrixService, RoleRepository, PermissionRepository, ModuleManagementRepository, AdminRepository],
})
export class PermissionMatrixModule {}
