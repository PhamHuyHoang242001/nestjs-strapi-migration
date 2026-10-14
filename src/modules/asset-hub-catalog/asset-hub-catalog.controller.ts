import { BearerGuard } from '@common/guards/bearer.guard';
import { RequestWithInfo } from '@common/types/request-with-info';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Put,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AssetHubCatalogService } from './asset-hub-catalog.service';
import { AssetHubUserDirectoryService } from './asset-hub-user-directory.service';
import { AssetHubSupporterService } from './asset-hub-supporter.service';
import {
  AiHubPackageParamDto,
  AiHubWorkspaceParamDto,
  ListTagsQueryDto,
  ListUsersQueryDto,
  ReplaceSupportersDto,
} from './dto';

// Mounted at 'v1/asset-hub' alongside the latest feed — every cross-workspace read the Skill and
// Prompt libraries share lives under this one prefix. Routes are static, so they cannot shadow or
// be shadowed by the feed's own routes.
@Controller('v1/asset-hub')
@ApiTags('asset-hub')
@ApiBearerAuth()
@UseGuards(BearerGuard)
// Controller-scoped strict validation, matching the sibling controllers: unknown query params are
// rejected rather than silently dropped, and values are transformed to their declared types.
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class AssetHubCatalogController {
  constructor(
    private readonly catalogService: AssetHubCatalogService,
    private readonly userDirectoryService: AssetHubUserDirectoryService,
    private readonly supporterService: AssetHubSupporterService,
  ) {}

  // GET /v1/asset-hub/tags — seeded tag catalog, optionally narrowed to one workspace/kind.
  // Bearer only: tag names are already visible on every list card.
  @ApiOperation({ summary: 'List selectable tags' })
  @Get('tags')
  listTags(@Query() q: ListTagsQueryDto) {
    return this.catalogService.listTags({ artifact_type: q.artifact_type, kind: q.kind });
  }

  // GET /v1/asset-hub/publishers — seeded publishing units. Bearer only, same reasoning as tags.
  @ApiOperation({ summary: 'List publishing units' })
  @Get('publishers')
  listPublishers() {
    return this.catalogService.listPublishers();
  }

  // GET /v1/asset-hub/users — the person-in-charge picker: a paginated directory of id + email.
  // Bearer-only: prompt upload is open to every logged-in user, so any caller can open the prompt
  // create/edit form and needs this picker for responsible users / supporters.
  @ApiOperation({ summary: 'List users for the person-in-charge picker' })
  @Get('users')
  listUsers(@Query() q: ListUsersQueryDto) {
    return this.userDirectoryService.list({ page: q.page, limit: q.limit, search: q.search });
  }

  // GET /v1/asset-hub/:type/supporter-candidates — users who may be added as supporters of that
  // workspace: holders of its upload code (prompt: every live user). Paged id + email, like /users.
  @ApiOperation({ summary: 'List users eligible as supporters of a workspace (upload holders; prompt: all)' })
  @Get(':type/supporter-candidates')
  listSupporterCandidates(@Param() p: AiHubWorkspaceParamDto, @Query() q: ListUsersQueryDto) {
    return this.supporterService.listCandidates(p.type, { page: q.page, limit: q.limit, search: q.search });
  }

  // PUT /v1/asset-hub/:type/items/:id/supporters — full-replace the package's supporters ([] clears).
  // Only the package creator or a current supporter; each id must be a supporter candidate.
  @ApiOperation({ summary: 'Replace package supporters (creator or current supporter only)' })
  @Put(':type/items/:id/supporters')
  replaceSupporters(@Param() p: AiHubPackageParamDto, @Body() dto: ReplaceSupportersDto, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number;
    if (!userId) throw new ForbiddenException('User not authenticated');
    return this.supporterService.replaceSupporters(p.type, p.id, dto.supporter_ids, userId);
  }
}
