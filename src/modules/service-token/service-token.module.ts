import { ServiceTokenGuard } from '@common/guards/service-token.guard';
import { AdminRepository } from '@modules/admins/repository/admin.repository';
import { JwtToken } from '@modules/databases/jwt-token.entity';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
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
    // Required by BearerGuard on the controller routes. PermissionGuard is provided globally
    // by the @Global AuthorizationModule, so it needs no local wiring here.
    AdminRepository,
  ],
  // Exported so other modules can wire ServiceTokenGuard onto service-to-service routes.
  exports: [ServiceTokenService, ServiceTokenGuard],
})
export class ServiceTokenModule {}
