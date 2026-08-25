import { RequirePermission } from '@common/authorization/decorators/require-permission.decorator';
import { PermissionGuard } from '@common/authorization/guards/permission.guard';
import { BearerGuard } from '@common/guards/bearer.guard';
import { Controller, Get, Query, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AssetHubCatalogService } from './asset-hub-catalog.service';
import { AssetHubUserDirectoryService } from './asset-hub-user-directory.service';
import { ListTagsQueryDto, ListUsersQueryDto } from './dto';

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
  // Permission-gated rather than Bearer-only, because it is a browsable user directory: only a
  // caller who can actually open a create/edit form has a reason to page through it. PermissionGuard
  // is OR across codes, so holding any one of the four upload/approve grants is enough.
  @ApiOperation({ summary: 'List users for the person-in-charge picker' })
  @Get('users')
  @UseGuards(PermissionGuard)
  @RequirePermission(
    'skill_upload',
    'prompt_upload',
    'skill_approve',
    'prompt_approve',
    'api_upload',
    'api_approve',
  )
  listUsers(@Query() q: ListUsersQueryDto) {
    return this.userDirectoryService.list({ page: q.page, limit: q.limit, search: q.search });
  }
}
