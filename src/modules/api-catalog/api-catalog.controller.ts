import { RequirePermission } from '@common/authorization/decorators/require-permission.decorator';
import { PermissionGuard } from '@common/authorization/guards/permission.guard';
import { BearerGuard } from '@common/guards/bearer.guard';
import { RequestWithInfo } from '@common/types/request-with-info';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiCatalogQueryService } from './api-catalog-query.service';
import { ApiCatalogUploadService } from './api-catalog-upload.service';
import {
  CreateApiPackageDto,
  CreateApiVersionDto,
  ListApiQueryDto,
  ListVersionsDto,
  RejectApiVersionDto,
  ReviewQueryDto,
  ToggleStatusDto,
} from './dto';

// Controller mounted at 'v1/prompt' so routes resolve to /api/v1/api-catalog/*.
// IMPORTANT: No DataAccessInterceptor, no OwnerScopeGuard on prompt routes.
//
// Spec is inline JSON (mock_req / mock_res). There is NO ZIP fetch — only the optional avatar
// URL is validated against the configured Strapi origin at submit time.
@Controller('v1/api-catalog')
@ApiTags('api-catalog')
@ApiBearerAuth()
@UseGuards(BearerGuard)
// Controller-scoped strict validation: unknown properties are rejected outright
// (forbidNonWhitelisted) so a stray `file` / media id fails loudly rather than being
// silently dropped. Scoped here — not global — to avoid changing validation semantics elsewhere.
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class ApiCatalogController {
  constructor(
    private readonly queryService: ApiCatalogQueryService,
    private readonly uploadService: ApiCatalogUploadService,
  ) {}

  // GET /v1/api-catalog/items — list packages with active version joined. Defaults to active-only;
  // status=inactive is honored only for approvers (drives the status gate in the service).
  @ApiOperation({ summary: 'List API packages (active by default; inactive for approvers)' })
  @Get('items')
  listItems(@Query() q: ListApiQueryDto, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number;
    if (!userId) throw new ForbiddenException('User not authenticated');
    return this.queryService.list(q, userId);
  }

  // Workspace counters moved to GET /v1/asset-hub/stats, which reports skill and prompt together
  // so the dashboard makes one request instead of two.

  // GET /v1/api-catalog/items/:id — detail with versions[] folded in + caller-scoped flags.
  // All callers are authenticated (BearerGuard); userId drives isUpdate / inactive access / scrubbing.
  @ApiOperation({ summary: 'Get API package detail with version history' })
  @Get('items/:id')
  getItem(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number;
    if (!userId) throw new ForbiddenException('User not authenticated');
    return this.queryService.detail(id, userId);
  }

  // GET /v1/api-catalog/reviews/submitters — distinct pending-version creators for the queue filter.
  // Static path before GET reviews so it is never captured as a param. Approver-only.
  @ApiOperation({ summary: 'Distinct submitters of pending API versions (approver-only)' })
  @UseGuards(PermissionGuard)
  @RequirePermission('api_approve')
  @Get('reviews/submitters')
  listReviewSubmitters() {
    return this.queryService.listReviewSubmitters();
  }

  // GET /v1/api-catalog/reviews — pending versions queue. Approver-only (PermissionGuard).
  @ApiOperation({ summary: 'Review queue (approver-only pending versions)' })
  @UseGuards(PermissionGuard)
  @RequirePermission('api_approve')
  @Get('reviews')
  listReviews(@Query() q: ReviewQueryDto) {
    return this.queryService.listReviews(q);
  }

  // GET /v1/api-catalog/versions — flat "My Version" list (all states) with code/state filters +
  // pagination. codesOnly=true returns the distinct-code options for the filter select.
  // BearerGuard only; always own-scoped in the service — every caller, approver included, sees only
  // versions they submitted or that belong to a package they created (role never widens this).
  @ApiOperation({ summary: 'List my versions (own-scope for every role, approver included)' })
  @Get('versions')
  listVersions(@Query() q: ListVersionsDto, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number;
    if (!userId) throw new ForbiddenException('User not authenticated');
    return this.queryService.listVersions(q, userId);
  }

  // GET /v1/api-catalog/versions/:vid — full caller-authorized version detail. Service permits the
  // submitter, package creator, or an approver and builds predecessor comparison for pending rows.
  @ApiOperation({ summary: 'Get API version detail' })
  @Get('versions/:vid')
  getVersion(@Param('vid', ParseIntPipe) vid: number, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number;
    if (!userId) throw new ForbiddenException('User not authenticated');
    return this.queryService.versionDetail(vid, userId);
  }

  // GET /v1/api-catalog/versions/:vid/diff — capability: upload OR approve. Service then restricts
  // upload-only callers to submitter / package creator; approvers see any version.
  @ApiOperation({ summary: 'Get API version diff (upload or approve; row-ownership in service)' })
  @UseGuards(PermissionGuard)
  @RequirePermission('api_upload', 'api_approve')
  @Get('versions/:vid/diff')
  getDiff(@Param('vid', ParseIntPipe) vid: number, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number;
    if (!userId) throw new ForbiddenException('User not authenticated');
    return this.queryService.getDiff(vid, userId);
  }

  // GET /v1/api-catalog/my-permissions — caller's prompt permission flags.
  @ApiOperation({ summary: 'Get caller API catalog permission flags' })
  @Get('my-permissions')
  myPermissions(@Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number;
    if (!userId) throw new ForbiddenException('User not authenticated');
    return this.uploadService.getMyPermissions(userId);
  }

  // POST /v1/api-catalog/items — create new package from inline prompt text; requires api_upload.
  @ApiOperation({ summary: 'Create new API package' })
  @Post('items')
  @UseGuards(PermissionGuard)
  @RequirePermission('api_upload')
  async createItem(@Body() dto: CreateApiPackageDto, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number;
    if (!userId) throw new ForbiddenException('User not authenticated');
    return this.uploadService.createNew(dto, userId);
  }

  // PUT /v1/api-catalog/items/:id/versions — submit a new version (full-body replace);
  // requires api_upload. Creates a pending version; the current active version keeps serving
  // until this one is approved (see uploadService.createVersion / approve).
  @ApiOperation({ summary: 'Submit new version of an existing API package' })
  @Put('items/:id/versions')
  @UseGuards(PermissionGuard)
  @RequirePermission('api_upload')
  async createVersion(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateApiVersionDto,
    @Req() req: RequestWithInfo,
  ) {
    const userId = req.info?.user?.id as number;
    if (!userId) throw new ForbiddenException('User not authenticated');
    return this.uploadService.createVersion(id, dto, userId);
  }

  // POST /v1/api-catalog/versions/:vid/approve — requires api_approve.
  @ApiOperation({ summary: 'Approve a pending API version (promotes to active)' })
  @Post('versions/:vid/approve')
  @UseGuards(PermissionGuard)
  @RequirePermission('api_approve')
  async approveVersion(@Param('vid', ParseIntPipe) vid: number, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number;
    if (!userId) throw new ForbiddenException('User not authenticated');
    return this.uploadService.approve(vid, userId);
  }

  // POST /v1/api-catalog/versions/:vid/reject — requires api_approve; reason required in body.
  @ApiOperation({ summary: 'Reject a pending API version (reason required)' })
  @Post('versions/:vid/reject')
  @UseGuards(PermissionGuard)
  @RequirePermission('api_approve')
  async rejectVersion(
    @Param('vid', ParseIntPipe) vid: number,
    @Body() dto: RejectApiVersionDto,
    @Req() req: RequestWithInfo,
  ) {
    const userId = req.info?.user?.id as number;
    if (!userId) throw new ForbiddenException('User not authenticated');
    return this.uploadService.reject(vid, dto, userId);
  }

  // PATCH /v1/api-catalog/items/:id/status — toggle active/inactive; requires api_approve.
  @ApiOperation({ summary: 'Toggle API package active/inactive status' })
  @Patch('items/:id/status')
  @UseGuards(PermissionGuard)
  @RequirePermission('api_approve')
  async toggleStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: ToggleStatusDto) {
    return this.uploadService.toggleStatus(id, dto);
  }
}
