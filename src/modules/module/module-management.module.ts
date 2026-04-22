import { Module as NestModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@modules/databases/module.entity';
import { Permission } from '@modules/databases/permission.entity';
import { AdminRepository } from '@modules/admins/repository/admin.repository';
import { ModuleManagementController } from './module-management.controller';
import { ModuleManagementService } from './module-management.service';
import { ModuleManagementRepository } from './repository/module-management.repository';
import { PermissionRepository } from '@modules/permission/repository/permission.repository';

@NestModule({
  imports: [TypeOrmModule.forFeature([Module, Permission])],
  controllers: [ModuleManagementController],
  providers: [ModuleManagementService, ModuleManagementRepository, PermissionRepository, AdminRepository],
  exports: [ModuleManagementService, ModuleManagementRepository],
})
export class ModuleManagementModule {}
