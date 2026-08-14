import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SkillVersion } from '@modules/databases/skill-version.entity';
import { PromptVersion } from '@modules/databases/prompt-version.entity';
import { LatestArtifactsController } from './latest-artifacts.controller';
import { LatestArtifactsService } from './latest-artifacts.service';

// AuthorizationModule is @Global(), so BearerGuard's dependencies are available without re-importing.
// The version entities are registered so the service can borrow an EntityManager for the raw,
// parameter-bound feed queries across skill_versions / prompt_versions / users.
@Module({
  imports: [TypeOrmModule.forFeature([SkillVersion, PromptVersion])],
  controllers: [LatestArtifactsController],
  providers: [LatestArtifactsService],
})
export class LatestArtifactsModule {}
