import { Global, Module } from '@nestjs/common';
import { AdminsService } from './admins.service';
import { AdminsController } from './admins.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Admins } from '@modules/databases/admin.entity';
import { AdminRepository } from './repository/admin.repository';

// Global so AdminRepository is injectable everywhere BearerGuard is applied, matching the
// existing @Global TokenModule/UsersModule pattern that already exports Token/User repositories.
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Admins])],
  controllers: [AdminsController],
  providers: [AdminsService, AdminRepository],
  exports: [AdminRepository],
})
export class AdminsModule {}
