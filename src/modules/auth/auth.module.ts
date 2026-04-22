import { TokenRepository } from '@modules/token/repository/token.repository';
import { Users } from '@modules/databases/user.entity';
import { UserRepository } from '@modules/users/repository/users.repository';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthAdminController } from './auth-admin.controller';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PassportModule } from '@nestjs/passport';
import { Admins } from '@modules/databases/admin.entity';
import { AdminRepository } from '@modules/admins/repository/admin.repository';
import { CommonServiceModule } from '@modules/common-service/common-service.module';

@Module({
  imports: [
    PassportModule.register({ session: true }),
    TypeOrmModule.forFeature([Users, Admins]),
    PassportModule,
    CommonServiceModule,
  ],
  controllers: [AuthController, AuthAdminController],
  providers: [AuthService, UserRepository, TokenRepository, AdminRepository],
  exports: [AuthService],
})
export class AuthModule {}
