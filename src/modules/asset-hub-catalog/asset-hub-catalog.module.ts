import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssetHubTag } from '@modules/databases/asset-hub-tag.entity';
import { AssetHubPublisher } from '@modules/databases/asset-hub-publisher.entity';
import { User } from '@modules/databases/user.entity';
import { AssetHubCatalogController } from './asset-hub-catalog.controller';
import { AssetHubCatalogService } from './asset-hub-catalog.service';
import { AssetHubUserDirectoryService } from './asset-hub-user-directory.service';
import { AssetHubItemMetaService } from './asset-hub-item-meta.service';
import { AssetHubItemMetaReadService } from './asset-hub-item-meta-read.service';

// AuthorizationModule is @Global(), so BearerGuard/PermissionGuard dependencies resolve without
// re-importing. Only the three read-only tables this module projects are registered.
// AssetHubItemMetaService is exported because the skill and prompt write paths both persist the
// same publisher/PIC/tag metadata — it operates purely on the caller's transaction manager.
@Module({
  imports: [TypeOrmModule.forFeature([AssetHubTag, AssetHubPublisher, User])],
  controllers: [AssetHubCatalogController],
  providers: [
    AssetHubCatalogService,
    AssetHubUserDirectoryService,
    AssetHubItemMetaService,
    AssetHubItemMetaReadService,
  ],
  exports: [AssetHubItemMetaService, AssetHubItemMetaReadService],
})
export class AssetHubCatalogModule {}
