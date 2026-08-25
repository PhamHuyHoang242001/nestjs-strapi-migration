import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiPackage } from '@modules/databases/api-catalog-package.entity';
import { ApiVersion } from '@modules/databases/api-catalog-version.entity';
import { ApiPackageResponsible } from '@modules/databases/api-catalog-package-responsible.entity';
import { ApiVersionTag } from '@modules/databases/api-catalog-version-tag.entity';
import { AssetHubCatalogModule } from '@modules/asset-hub-catalog/asset-hub-catalog.module';
import { ApiCatalogController } from './api-catalog.controller';
import { ApiCatalogQueryService } from './api-catalog-query.service';
import { ApiCatalogUploadService } from './api-catalog-upload.service';
import { ApiAvatarUrlService } from './api-avatar-url.util';
import { CategoryModule } from '@modules/category/category.module';

// AuthorizationModule is @Global(), so PermissionQueryService, PermissionGuard,
// and BearerGuard-required deps are available without re-importing here.
@Module({
  imports: [
    TypeOrmModule.forFeature([ApiPackage, ApiVersion, ApiPackageResponsible, ApiVersionTag]),
    CategoryModule,
    // Supplies AssetHubItemMetaService — the shared publisher/PIC/tag validation + persistence
    // the create and bump transactions use.
    AssetHubCatalogModule,
  ],
  controllers: [ApiCatalogController],
  providers: [ApiCatalogQueryService, ApiCatalogUploadService, ApiAvatarUrlService],
})
export class ApiCatalogModule {}
