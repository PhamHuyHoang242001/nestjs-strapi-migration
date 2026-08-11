import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SkillPackage } from '@modules/databases/skill-package.entity';
import { SkillVersion } from '@modules/databases/skill-version.entity';
import { SkillVersionFile } from '@modules/databases/skill-version-file.entity';
import { SkillPackageController } from './skill-package.controller';
import { SkillPackageQueryService } from './skill-package-query.service';
import { SkillPackageUploadService } from './skill-package-upload.service';
import { SkillFileFetchService } from './skill-file-fetch.util';

// AuthorizationModule is @Global(), so PermissionQueryService, PermissionGuard,
// and BearerGuard-required deps are available without re-importing here.
@Module({
  imports: [TypeOrmModule.forFeature([SkillPackage, SkillVersion, SkillVersionFile])],
  controllers: [SkillPackageController],
  providers: [SkillPackageQueryService, SkillPackageUploadService, SkillFileFetchService],
})
export class SkillPackageModule {}
