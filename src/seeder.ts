import { Permission } from '@modules/databases/permission.entity';
import { Role } from '@modules/databases/role.entity';
import { Users } from '@modules/databases/user.entity';
import { Module } from '@modules/databases/module.entity';
import { UserRole } from '@modules/databases/user-role.entity';
import { DataAccess } from '@modules/databases/data-access.entity';
import { ChangeHistory } from '@modules/databases/change-history.entity';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { seeder } from 'nestjs-seeder';
import ormConfig from './configuration/orm.config';
import { ModuleSeeder } from './seeders/module.seeder';
import { PermissionSeeder } from './seeders/permission.seeder';
import { RoleSeeder } from './seeders/role.seeder';
import { UserSeeder } from './seeders/user.seeder';
import { UserRoleSeeder } from './seeders/user-role.seeder';
import { DataAccessSeeder } from './seeders/data-access.seeder';
import { ChangeHistorySeeder } from './seeders/change-history.seeder';
import { Settings } from '@modules/databases/setting.entity';
import { SettingSeeder } from './seeders/setting.seeder';
import { Admins } from '@modules/databases/admin.entity';
import { AdminSeeder } from './seeders/admin.seeder';

seeder({
  imports: [
    ConfigModule.forRoot(),
    TypeOrmModule.forRoot(ormConfig),
    TypeOrmModule.forFeature([Module, Permission, Role, Users, UserRole, DataAccess, ChangeHistory, Settings, Admins]),
  ],
}).run([ModuleSeeder, PermissionSeeder, UserSeeder, RoleSeeder, UserRoleSeeder, DataAccessSeeder, ChangeHistorySeeder, SettingSeeder, AdminSeeder]);
