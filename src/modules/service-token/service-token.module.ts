import { ServiceTokenGuard } from '@common/guards/service-token.guard';
import { AdminRepository } from '@modules/admins/repository/admin.repository';
import { JwtToken } from '@modules/databases/jwt-token.entity';
import { RoleRepository } from '@modules/role/repository/role.repository';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IsServiceAdminGuard } from './guards/is-service-admin.guard';
import { JwtTokenRepository } from './repository/jwt-token.repository';
import { ServiceTokenController } from './service-token.controller';
import { ServiceTokenService } from './service-token.service';

@Module({
  imports: [TypeOrmModule.forFeature([JwtToken])],
  controllers: [ServiceTokenController],
  providers: [
    ServiceTokenService,
    JwtTokenRepository,
    ServiceTokenGuard,
    IsServiceAdminGuard,
    // Required by route guards (BearerGuard needs AdminRepository; role gate needs RoleRepository).
    AdminRepository,
    RoleRepository,
  ],
  // Exported so other modules can wire ServiceTokenGuard onto service-to-service routes.
  exports: [ServiceTokenService, ServiceTokenGuard],
})
export class ServiceTokenModule {}
