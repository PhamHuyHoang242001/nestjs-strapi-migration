import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoworkerPackage } from '@modules/databases/coworker-package.entity';
import { CoworkerVersion } from '@modules/databases/coworker-version.entity';
import { CoworkerPackageResponsible } from '@modules/databases/coworker-package-responsible.entity';
import { CoworkerChannel } from '@modules/databases/coworker-channel.entity';
import { CoworkerModel } from '@modules/databases/coworker-model.entity';
import { CoworkerVersionChannel } from '@modules/databases/coworker-version-channel.entity';
import { AssetHubCatalogModule } from '@modules/asset-hub-catalog/asset-hub-catalog.module';
import { PromptAvatarUrlService } from '@modules/prompt-library/prompt-avatar-url.util';
import { CoworkerController } from './coworker.controller';
import { CoworkerQueryService } from './coworker-query.service';
import { CoworkerUploadService } from './coworker-upload.service';
import { CoworkerCatalogService } from './coworker-catalog.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CoworkerPackage,
      CoworkerVersion,
      CoworkerPackageResponsible,
      CoworkerChannel,
      CoworkerModel,
      CoworkerVersionChannel,
    ]),
    AssetHubCatalogModule,
  ],
  controllers: [CoworkerController],
  providers: [CoworkerQueryService, CoworkerUploadService, CoworkerCatalogService, PromptAvatarUrlService],
})
export class CoworkerModule {}
