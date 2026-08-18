import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PromptPackage } from '@modules/databases/prompt-package.entity';
import { PromptVersion } from '@modules/databases/prompt-version.entity';
import { PromptLibraryController } from './prompt-library.controller';
import { PromptLibraryQueryService } from './prompt-library-query.service';
import { PromptLibraryUploadService } from './prompt-library-upload.service';
import { PromptAvatarUrlService } from './prompt-avatar-url.util';
import { CategoryModule } from '@modules/category/category.module';

// AuthorizationModule is @Global(), so PermissionQueryService, PermissionGuard,
// and BearerGuard-required deps are available without re-importing here.
@Module({
  imports: [TypeOrmModule.forFeature([PromptPackage, PromptVersion]), CategoryModule],
  controllers: [PromptLibraryController],
  providers: [PromptLibraryQueryService, PromptLibraryUploadService, PromptAvatarUrlService],
})
export class PromptLibraryModule {}
