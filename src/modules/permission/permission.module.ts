import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Permission } from '../databases/permission.entity';
import { PermissionController } from './permission.controller';
import { PermissionService } from './permission.service';
import { PermissionRepository } from './repository/permission.repository';
import { Admins } from '@modules/databases/admin.entity';
import { AdminRepository } from '@modules/admins/repository/admin.repository';

@Module({
  imports: [TypeOrmModule.forFeature([Permission, Admins])],
  controllers: [PermissionController],
  providers: [PermissionService, PermissionRepository, AdminRepository],
  exports: [PermissionService, PermissionRepository],
})
export class PermissionModule {}
