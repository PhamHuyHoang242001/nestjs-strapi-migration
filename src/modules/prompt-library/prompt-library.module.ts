import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PromptPackage } from '@modules/databases/prompt-package.entity';
import { PromptVersion } from '@modules/databases/prompt-version.entity';
import { PromptPackageResponsible } from '@modules/databases/prompt-package-responsible.entity';
import { PromptVersionTag } from '@modules/databases/prompt-version-tag.entity';
import { AssetHubCatalogModule } from '@modules/asset-hub-catalog/asset-hub-catalog.module';
import { PromptLibraryController } from './prompt-library.controller';
import { PromptLibraryQueryService } from './prompt-library-query.service';
import { PromptLibraryUploadService } from './prompt-library-upload.service';
import { PromptAvatarUrlService } from './prompt-avatar-url.util';
import { CategoryModule } from '@modules/category/category.module';

// AuthorizationModule is @Global(), so PermissionQueryService, PermissionGuard,
// and BearerGuard-required deps are available without re-importing here.
@Module({
  imports: [
    TypeOrmModule.forFeature([PromptPackage, PromptVersion, PromptPackageResponsible, PromptVersionTag]),
    CategoryModule,
    // Supplies AssetHubItemMetaService — the shared publisher/PIC/tag validation + persistence
    // the create and bump transactions use.
    AssetHubCatalogModule,
  ],
  controllers: [PromptLibraryController],
  providers: [PromptLibraryQueryService, PromptLibraryUploadService, PromptAvatarUrlService],
})
export class PromptLibraryModule {}
