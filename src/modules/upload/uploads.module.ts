import { Media } from '@modules/databases/media.entity';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomUploadController } from './custom-upload.controller';
import { CustomUploadService } from './custom-upload.service';
import { MediaRepository } from './repository/media.repository';

// Home of the file-upload endpoints. Currently just the Strapi-parity POST /v1/custom-upload;
// the older /v1/uploads/* routes were dropped when the media table moved to the Strapi shape.
//
// AuthorizationModule is @Global(), so BearerGuard's dependencies resolve without importing
// anything auth-related here.
@Module({
  imports: [TypeOrmModule.forFeature([Media])],
  controllers: [CustomUploadController],
  providers: [CustomUploadService, MediaRepository],
  exports: [CustomUploadService, MediaRepository],
})
export class UploadsModule {}
