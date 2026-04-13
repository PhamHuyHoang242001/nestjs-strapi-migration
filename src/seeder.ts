import { Permission } from '@modules/databases/permission.entity';
import { Role } from '@modules/databases/role.entity';
import { Users } from '@modules/databases/user.entity';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { seeder } from 'nestjs-seeder';
import ormConfig from './configuration/orm.config';
import { PermissionSeeder } from './seeders/permission.seeder';
import { RoleSeeder } from './seeders/role.seeder';
import { UserSeeder } from './seeders/user.seeder';
import { Settings } from '@modules/databases/setting.entity';
import { SettingSeeder } from './seeders/setting.seeder';
import { Admins } from '@modules/databases/admin.entity';
import { AdminSeeder } from './seeders/admin.seeder';

seeder({
  imports: [
    ConfigModule.forRoot(),
    TypeOrmModule.forRoot(ormConfig),
    TypeOrmModule.forFeature([
      Permission,
      Role,
      Users,
      Settings,
      Admins,
    ]),
  ],
}).run([
  PermissionSeeder,
  RoleSeeder,
  UserSeeder,
  SettingSeeder,
  AdminSeeder,
]);
