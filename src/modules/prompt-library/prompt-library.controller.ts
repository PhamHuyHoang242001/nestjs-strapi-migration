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
  Res,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { buildDownloadFilename } from '@common/utils';
import { Response } from 'express';
import { PromptLibraryQueryService } from './prompt-library-query.service';
import { PromptLibraryUploadService } from './prompt-library-upload.service';
import { buildPromptMarkdown } from './prompt-markdown.util';
import {
  CreatePromptPackageDto,
  CreatePromptVersionDto,
  ListPromptQueryDto,
  ListVersionsDto,
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

  // GET /v1/prompt/items — list packages with active version joined. Defaults to active-only;
  // status=inactive is honored only for approvers (drives the status gate in the service).
  @ApiOperation({ summary: 'List prompt packages (active by default; inactive for approvers)' })
  @Get('items')
  listItems(@Query() q: ListPromptQueryDto, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number;
    if (!userId) throw new ForbiddenException('User not authenticated');
    return this.queryService.list(q, userId);
  }

  // GET /v1/prompt/stats — whole-workspace latest-state + actual-published counters.
  @ApiOperation({ summary: 'Get Prompt workspace dashboard counters' })
  @Get('stats')
  stats() {
    return this.queryService.stats();
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

  // GET /v1/prompt/items/:id/download — export the active version as a professional .md file.
  // Auth = controller-level BearerGuard; any authenticated user may export an active package
  // (inactive packages are exportable only by owner/approver — enforced in resolveActiveForExport).
  @ApiOperation({ summary: 'Download the active prompt version as a Markdown file' })
  @Get('items/:id/download')
  async downloadMarkdown(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithInfo, @Res() res: Response) {
    const userId = req.info?.user?.id as number;
    if (!userId) throw new ForbiddenException('User not authenticated');

    const { version, authorEmail, categoryName } = await this.queryService.resolveActiveForExport(id, userId);
    const md = buildPromptMarkdown(version, authorEmail, categoryName);
    // Filename is already a safe slug ([a-z0-9-] + -v<n> + ext) — quote directly, no percent-encode.
    const filename = buildDownloadFilename(version.name, version.version_no, 'md', 'prompt');
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(md);
  }

  // GET /v1/prompt/reviews/submitters — distinct pending-version creators for the queue filter.
  // Static path before GET reviews so it is never captured as a param. Approver-only.
  @ApiOperation({ summary: 'Distinct submitters of pending prompt versions (approver-only)' })
  @UseGuards(PermissionGuard)
  @RequirePermission('prompt_approve')
  @Get('reviews/submitters')
  listReviewSubmitters() {
    return this.queryService.listReviewSubmitters();
  }

  // GET /v1/prompt/reviews — pending versions queue. Approver-only (PermissionGuard).
  @ApiOperation({ summary: 'Review queue (approver-only pending versions)' })
  @UseGuards(PermissionGuard)
  @RequirePermission('prompt_approve')
  @Get('reviews')
  listReviews(@Query() q: ReviewQueryDto) {
    return this.queryService.listReviews(q);
  }

  // GET /v1/prompt/versions — flat "My Version" list (all states) with code/state filters +
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

  // GET /v1/prompt/versions/:vid — full caller-authorized version detail. Service permits the
  // submitter, package creator, or an approver and builds predecessor comparison for pending rows.
  @ApiOperation({ summary: 'Get prompt version detail' })
  @Get('versions/:vid')
  getVersion(@Param('vid', ParseIntPipe) vid: number, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number;
    if (!userId) throw new ForbiddenException('User not authenticated');
    return this.queryService.versionDetail(vid, userId);
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
