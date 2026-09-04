import { RequirePermission } from '@common/authorization/decorators/require-permission.decorator';
import { PermissionGuard } from '@common/authorization/guards/permission.guard';
import { BearerGuard } from '@common/guards/bearer.guard';
import { RequestWithInfo } from '@common/types/request-with-info';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
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
import * as fs from 'fs';
import { SkillPackageQueryService } from './skill-package-query.service';
import { SkillPackageUploadService } from './skill-package-upload.service';
import { SkillFileFetchService } from './skill-file-fetch.util';
import {
  CreateSkillPackageDto,
  CreateSkillVersionDto,
  ListSkillQueryDto,
  ListVersionsDto,
  RejectSkillVersionDto,
  ReviewQueryDto,
  ToggleStatusDto,
} from './dto';

// Controller mounted at 'v1/skill' so routes resolve to /api/v1/skill/* (C6).
// IMPORTANT: No DataAccessInterceptor, no OwnerScopeGuard on skill routes (M6).
//
// Upload model is PULL-based: clients upload the zip/avatar to Strapi first and send
// the resulting URLs in the JSON body (zip as a `file` object, avatar as a plain URL —
// mirroring the diagnostic report's file/icon). The backend fetches file.fileUrl to unzip/validate.
@Controller('v1/skill')
@ApiTags('skill-package')
@ApiBearerAuth()
@UseGuards(BearerGuard)
// Controller-scoped strict validation: unknown properties are rejected outright
// (forbidNonWhitelisted) so a client-supplied media id / stray field fails loudly
// rather than being silently dropped (M2). Scoped here — not global — to avoid
// changing validation semantics for other modules.
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class SkillPackageController {
  constructor(
    private readonly queryService: SkillPackageQueryService,
    private readonly uploadService: SkillPackageUploadService,
    private readonly fileFetchService: SkillFileFetchService,
  ) {}

  // GET /v1/skill/items — list packages with active version joined. Defaults to active-only;
  // status=inactive is honored only for approvers (drives the status gate in the service).
  @ApiOperation({ summary: 'List skill packages (active by default; inactive for approvers)' })
  @Get('items')
  listItems(@Query() q: ListSkillQueryDto, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number;
    if (!userId) throw new ForbiddenException('User not authenticated');
    return this.queryService.list(q, userId);
  }

  // Workspace counters moved to GET /v1/asset-hub/stats, which reports skill and prompt together
  // so the dashboard makes one request instead of two.

  // GET /v1/skill/items/:id — detail with versions[] folded in (M7) + caller-scoped flags.
  // All callers are authenticated (BearerGuard); userId drives isUpdate / inactive access / scrubbing.
  @ApiOperation({ summary: 'Get skill package detail with version history' })
  @Get('items/:id')
  getItem(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number;
    if (!userId) throw new ForbiddenException('User not authenticated');
    return this.queryService.detail(id, userId);
  }

  // GET /v1/skill/items/:id/download — stream the active version's zip as an attachment.
  // Auth = controller-level BearerGuard; any authenticated user may download an active package
  // (inactive packages are downloadable only by owner/approver — enforced in resolveActiveZip).
  @ApiOperation({ summary: "Download the active skill version's zip archive" })
  @Get('items/:id/download')
  async downloadZip(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithInfo, @Res() res: Response) {
    const userId = req.info?.user?.id as number;
    if (!userId) throw new ForbiddenException('User not authenticated');

    const { fileUrl, name, versionNo } = await this.queryService.resolveActiveZip(id, userId);
    // resolveZipPath applies the same path-traversal guard as the upload fetch; never resolve
    // the stored file_url against the filesystem without it.
    const filePath = this.fileFetchService.resolveZipPath(fileUrl);
    // Must be a regular file (not a directory / special file) that exists — the DB row can
    // outlive the on-disk file since Strapi shares and sweeps this upload volume.
    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePath);
    } catch {
      throw new NotFoundException('File not found');
    }
    if (!stat.isFile()) throw new NotFoundException('File not found');

    // Filename is already a safe slug ([a-z0-9-] + -v<n> + ext) — quote it directly; do NOT
    // percent-encode inside the quotes (browsers would save the literal %xx sequences).
    const filename = buildDownloadFilename(name, versionNo, 'zip', 'skill');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Stream from disk (not the 20MB in-memory buffer) — mirrors transform-file.controller.
    // Handle a mid-stream read error (TOCTOU deletion / permission race): once headers are sent
    // an unhandled stream 'error' would hang the socket, so destroy the response explicitly.
    const stream = fs.createReadStream(filePath);
    stream.on('error', () => {
      if (res.headersSent) res.destroy();
      else res.status(404).end();
    });
    stream.pipe(res);
  }

  // GET /v1/skill/reviews/submitters — distinct pending-version creators for the queue filter.
  // Static path before GET reviews so it is never captured as a param. Approver-only.
  @ApiOperation({ summary: 'Distinct submitters of pending skill versions (approver-only)' })
  @UseGuards(PermissionGuard)
  @RequirePermission('skill_approve')
  @Get('reviews/submitters')
  listReviewSubmitters() {
    return this.queryService.listReviewSubmitters();
  }

  // GET /v1/skill/reviews — pending versions queue. Approver-only (PermissionGuard).
  @ApiOperation({ summary: 'Review queue (approver-only pending versions)' })
  @UseGuards(PermissionGuard)
  @RequirePermission('skill_approve')
  @Get('reviews')
  listReviews(@Query() q: ReviewQueryDto) {
    return this.queryService.listReviews(q);
  }

  // GET /v1/skill/versions — flat "My Version" list (all states) with code/state filters +
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

  // GET /v1/skill/versions/:vid — full caller-authorized version detail. Service permits the
  // submitter, package creator, or an approver and builds predecessor comparison for pending rows.
  @ApiOperation({ summary: 'Get skill version detail' })
  @Get('versions/:vid')
  getVersion(@Param('vid', ParseIntPipe) vid: number, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number;
    if (!userId) throw new ForbiddenException('User not authenticated');
    return this.queryService.versionDetail(vid, userId);
  }

  // GET /v1/skill/versions/:vid/diff — capability: upload OR approve. Service then restricts
  // upload-only callers to submitter / package creator; approvers see any version.
  @ApiOperation({ summary: 'Get skill.md diff (upload or approve; row-ownership in service)' })
  @UseGuards(PermissionGuard)
  @RequirePermission('skill_upload', 'skill_approve')
  @Get('versions/:vid/diff')
  getDiff(@Param('vid', ParseIntPipe) vid: number, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number;
    if (!userId) throw new ForbiddenException('User not authenticated');
    return this.queryService.getDiff(vid, userId);
  }

  // GET /v1/skill/my-permissions — caller's skill permission flags.
  @ApiOperation({ summary: 'Get caller skill permission flags' })
  @Get('my-permissions')
  myPermissions(@Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number;
    if (!userId) throw new ForbiddenException('User not authenticated');
    return this.uploadService.getMyPermissions(userId);
  }

  // POST /v1/skill/items — create new package from Strapi URLs; requires skill_upload.
  @ApiOperation({ summary: 'Create new skill package (from Strapi zip/avatar URLs)' })
  @Post('items')
  @UseGuards(PermissionGuard)
  @RequirePermission('skill_upload')
  async createItem(@Body() dto: CreateSkillPackageDto, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number;
    if (!userId) throw new ForbiddenException('User not authenticated');
    return this.uploadService.createNew(dto, userId);
  }

  // PUT /v1/skill/items/:id/versions — submit a new version from Strapi URLs (full-body replace);
  // requires skill_upload. Creates a pending version; the current active version keeps serving
  // until this one is approved (see uploadService.createVersion / approve).
  @ApiOperation({ summary: 'Submit new version of an existing skill package (from Strapi URLs)' })
  @Put('items/:id/versions')
  @UseGuards(PermissionGuard)
  @RequirePermission('skill_upload')
  async createVersion(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateSkillVersionDto,
    @Req() req: RequestWithInfo,
  ) {
    const userId = req.info?.user?.id as number;
    if (!userId) throw new ForbiddenException('User not authenticated');
    return this.uploadService.createVersion(id, dto, userId);
  }

  // PUT /v1/skill/versions/:vid — resubmit the latest rejected version (same body as a bump).
  @ApiOperation({ summary: 'Edit the latest rejected skill version (from Strapi URLs)' })
  @Put('versions/:vid')
  @UseGuards(PermissionGuard)
  @RequirePermission('skill_upload')
  async editVersion(
    @Param('vid', ParseIntPipe) vid: number,
    @Body() dto: CreateSkillVersionDto,
    @Req() req: RequestWithInfo,
  ) {
    const userId = req.info?.user?.id as number;
    if (!userId) throw new ForbiddenException('User not authenticated');
    return this.uploadService.editVersion(vid, dto, userId);
  }

  // POST /v1/skill/versions/:vid/approve — requires skill_approve.
  @ApiOperation({ summary: 'Approve a pending skill version (promotes to active)' })
  @Post('versions/:vid/approve')
  @UseGuards(PermissionGuard)
  @RequirePermission('skill_approve')
  async approveVersion(@Param('vid', ParseIntPipe) vid: number, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number;
    if (!userId) throw new ForbiddenException('User not authenticated');
    return this.uploadService.approve(vid, userId);
  }

  // POST /v1/skill/versions/:vid/reject — requires skill_approve; reason required in body.
  @ApiOperation({ summary: 'Reject a pending skill version (reason required)' })
  @Post('versions/:vid/reject')
  @UseGuards(PermissionGuard)
  @RequirePermission('skill_approve')
  async rejectVersion(
    @Param('vid', ParseIntPipe) vid: number,
    @Body() dto: RejectSkillVersionDto,
    @Req() req: RequestWithInfo,
  ) {
    const userId = req.info?.user?.id as number;
    if (!userId) throw new ForbiddenException('User not authenticated');
    return this.uploadService.reject(vid, dto, userId);
  }

  // PATCH /v1/skill/items/:id/status — toggle active/inactive; requires skill_approve.
  @ApiOperation({ summary: 'Toggle skill package active/inactive status' })
  @Patch('items/:id/status')
  @UseGuards(PermissionGuard)
  @RequirePermission('skill_approve')
  async toggleStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: ToggleStatusDto) {
    return this.uploadService.toggleStatus(id, dto);
  }
}
