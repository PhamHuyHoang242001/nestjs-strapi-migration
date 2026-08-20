import { BearerGuard } from '@common/guards/bearer.guard';
import { Controller, Get, Query, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { LatestArtifactsService } from './latest-artifacts.service';
import { LatestArtifactsQueryDto } from './dto/latest-artifacts-query.dto';

// Controller mounted at 'v1/asset-hub' so routes resolve to /api/v1/asset-hub/* — the cross-cutting
// feed spanning both the Skill and Prompt libraries. Auth = BearerGuard only, mirroring the public
// list endpoints on v1/skill and v1/prompt (any authenticated user may read the feed).
@Controller('v1/asset-hub')
@ApiTags('asset-hub')
@ApiBearerAuth()
@UseGuards(BearerGuard)
// Controller-scoped strict validation, consistent with the skill/prompt controllers: unknown query
// params are rejected outright rather than silently dropped, and values are transformed to types.
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class LatestArtifactsController {
  constructor(private readonly service: LatestArtifactsService) {}

  // GET /v1/asset-hub/latest — N newest skills + N newest prompts, each showing its latest version's
  // code / version / created_at / name / description / type / state / created_by. N defaults to the
  // configured LATEST_ARTIFACTS_LIMIT and may be overridden per request via ?limit.
  @ApiOperation({ summary: 'List the latest skills and prompts (latest version of each)' })
  @Get('latest')
  listLatest(@Query() q: LatestArtifactsQueryDto) {
    return this.service.listLatest(q.limit);
  }

  // GET /v1/asset-hub/stats — dashboard counters for both workspaces in one array, each row tagged
  // with its `type`. Replaces the per-workspace stats endpoints so the dashboard makes one request.
  @ApiOperation({ summary: 'Get dashboard counters for the Skill and Prompt workspaces' })
  @Get('stats')
  listStats() {
    return this.service.listStats();
  }
}
