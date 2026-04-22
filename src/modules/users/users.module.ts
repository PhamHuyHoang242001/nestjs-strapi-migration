import { AuthModule } from '@modules/auth/auth.module';

import { RoleRepository } from '@modules/role/repository/role.repository';

import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Users } from '../databases/user.entity';
import { UserRepository } from './repository/users.repository';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UserAddressRepository } from './repository/users-address.repository';
import { UserAddress } from '@modules/databases/user-address.entity';
import { Admins } from '@modules/databases/admin.entity';
import { AdminRepository } from '@modules/admins/repository/admin.repository';
import { UsersManagementController } from './users-management.controller';
import { TokenRepository } from '@modules/token/repository/token.repository';
import { UserRole } from '@modules/databases/user-role.entity';
import { ChangeHistory } from '@modules/databases/change-history.entity';
import { DataAccess } from '@modules/databases/data-access.entity';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Users, UserAddress, Admins, UserRole, ChangeHistory, DataAccess]), AuthModule],
  controllers: [UsersController, UsersManagementController],
  providers: [UsersService, UserRepository, RoleRepository, UserAddressRepository, AdminRepository, TokenRepository],
  exports: [UsersService, UserRepository, UserAddressRepository],
})
export class UsersModule {}
