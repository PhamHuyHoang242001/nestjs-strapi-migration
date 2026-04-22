import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { AuthModule } from '@modules/auth/auth.module';
import { AdminRepository } from '@modules/admins/repository/admin.repository';
import { MediaRepository } from './repository/media.repository';

@Module({
  imports: [AuthModule],
  controllers: [UploadsController],
  providers: [UploadsService, AdminRepository, MediaRepository],
})
export class UploadsModule {}
