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
import { PromptLibraryQueryService } from './prompt-library-query.service';
import { PromptLibraryUploadService } from './prompt-library-upload.service';
import {
  CreatePromptPackageDto,
  CreatePromptVersionDto,
  ListPromptQueryDto,
  MyItemsQueryDto,
  RejectPromptVersionDto,
  ReviewQueryDto,
  ToggleStatusDto,
} from './dto';

// Controller mounted at 'v1/prompt' so routes resolve to /api/v1/prompt/*.
// IMPORTANT: No DataAccessInterceptor, no OwnerScopeGuard on prompt routes.
//
// Upload model is inline: the prompt text is sent verbatim in the JSON body (prompt_content).
// There is NO ZIP fetch and NO Strapi content fetch — only the optional avatar URL is validated
// against the configured Strapi origin at submit time.
@Controller('v1/prompt')
@ApiTags('prompt-library')
@ApiBearerAuth()
@UseGuards(BearerGuard)
// Controller-scoped strict validation: unknown properties are rejected outright
// (forbidNonWhitelisted) so a stray `file` / media id fails loudly rather than being
// silently dropped. Scoped here — not global — to avoid changing validation semantics elsewhere.
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class PromptLibraryController {
  constructor(
    private readonly queryService: PromptLibraryQueryService,
    private readonly uploadService: PromptLibraryUploadService,
  ) {}

  // GET /v1/prompt/items — list active packages with active version joined.
  @ApiOperation({ summary: 'List active prompt packages' })
  @Get('items')
  listItems(@Query() q: ListPromptQueryDto) {
    return this.queryService.list(q);
  }

  // GET /v1/prompt/items/:id — detail with versions[] folded in + caller-scoped flags.
  // All callers are authenticated (BearerGuard); userId drives isUpdate / inactive access / scrubbing.
  @ApiOperation({ summary: 'Get prompt package detail with version history' })
  @Get('items/:id')
  getItem(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number;
    if (!userId) throw new ForbiddenException('User not authenticated');
    return this.queryService.detail(id, userId);
  }

  // GET /v1/prompt/my-items — caller's own packages, bucketed by the latest version's state
  // (status=pending|approved|rejected is required). SQL-paginated.
  @ApiOperation({ summary: "List caller's own prompt packages by latest-version state" })
  @Get('my-items')
  listMyItems(@Query() q: MyItemsQueryDto, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number;
    if (!userId) throw new ForbiddenException('User not authenticated');
    return this.queryService.listMyItems(q, userId);
  }

  // GET /v1/prompt/reviews — pending versions queue; service enforces scope authz.
  @ApiOperation({ summary: 'Review queue (approver=all pending; else own only)' })
  @Get('reviews')
  listReviews(@Query() q: ReviewQueryDto, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number;
    if (!userId) throw new ForbiddenException('User not authenticated');
    return this.queryService.listReviews(q, userId);
  }

  // GET /v1/prompt/versions/:vid/diff — service enforces owner-or-approver.
  @ApiOperation({ summary: 'Get prompt diff for a version (owner or approver only)' })
  @Get('versions/:vid/diff')
  getDiff(@Param('vid', ParseIntPipe) vid: number, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number;
    if (!userId) throw new ForbiddenException('User not authenticated');
    return this.queryService.getDiff(vid, userId);
  }

  // GET /v1/prompt/my-permissions — caller's prompt permission flags.
  @ApiOperation({ summary: 'Get caller prompt permission flags' })
  @Get('my-permissions')
  myPermissions(@Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number;
    if (!userId) throw new ForbiddenException('User not authenticated');
    return this.uploadService.getMyPermissions(userId);
  }

  // POST /v1/prompt/items — create new package from inline prompt text; requires prompt_upload.
  @ApiOperation({ summary: 'Create new prompt package (inline prompt_content)' })
  @Post('items')
  @UseGuards(PermissionGuard)
  @RequirePermission('prompt_upload')
  async createItem(@Body() dto: CreatePromptPackageDto, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number;
    if (!userId) throw new ForbiddenException('User not authenticated');
    return this.uploadService.createNew(dto, userId);
  }

  // PUT /v1/prompt/items/:id/versions — submit a new version (full-body replace);
  // requires prompt_upload. Creates a pending version; the current active version keeps serving
  // until this one is approved (see uploadService.createVersion / approve).
  @ApiOperation({ summary: 'Submit new version of an existing prompt package (inline prompt_content)' })
  @Put('items/:id/versions')
  @UseGuards(PermissionGuard)
  @RequirePermission('prompt_upload')
  async createVersion(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreatePromptVersionDto,
    @Req() req: RequestWithInfo,
  ) {
    const userId = req.info?.user?.id as number;
    if (!userId) throw new ForbiddenException('User not authenticated');
    return this.uploadService.createVersion(id, dto, userId);
  }

  // POST /v1/prompt/versions/:vid/approve — requires prompt_approve.
  @ApiOperation({ summary: 'Approve a pending prompt version (promotes to active)' })
  @Post('versions/:vid/approve')
  @UseGuards(PermissionGuard)
  @RequirePermission('prompt_approve')
  async approveVersion(@Param('vid', ParseIntPipe) vid: number, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number;
    if (!userId) throw new ForbiddenException('User not authenticated');
    return this.uploadService.approve(vid, userId);
  }

  // POST /v1/prompt/versions/:vid/reject — requires prompt_approve; reason required in body.
  @ApiOperation({ summary: 'Reject a pending prompt version (reason required)' })
  @Post('versions/:vid/reject')
  @UseGuards(PermissionGuard)
  @RequirePermission('prompt_approve')
  async rejectVersion(
    @Param('vid', ParseIntPipe) vid: number,
    @Body() dto: RejectPromptVersionDto,
    @Req() req: RequestWithInfo,
  ) {
    const userId = req.info?.user?.id as number;
    if (!userId) throw new ForbiddenException('User not authenticated');
    return this.uploadService.reject(vid, dto, userId);
  }

  // PATCH /v1/prompt/items/:id/status — toggle active/inactive; requires prompt_approve.
  @ApiOperation({ summary: 'Toggle prompt package active/inactive status' })
  @Patch('items/:id/status')
  @UseGuards(PermissionGuard)
  @RequirePermission('prompt_approve')
  async toggleStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: ToggleStatusDto) {
    return this.uploadService.toggleStatus(id, dto);
  }
}
