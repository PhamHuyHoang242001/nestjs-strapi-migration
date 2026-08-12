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
import { SkillPackageQueryService } from './skill-package-query.service';
import { SkillPackageUploadService } from './skill-package-upload.service';
import {
  CreateSkillPackageDto,
  CreateSkillVersionDto,
  ListSkillQueryDto,
  MyItemsQueryDto,
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
  ) {}

  // GET /v1/skill/items — list active packages with active version joined.
  @ApiOperation({ summary: 'List active skill packages' })
  @Get('items')
  listItems(@Query() q: ListSkillQueryDto) {
    return this.queryService.list(q);
  }

  // GET /v1/skill/items/:id — detail with versions[] folded in (M7) + caller-scoped flags.
  // All callers are authenticated (BearerGuard); userId drives isUpdate / inactive access / scrubbing.
  @ApiOperation({ summary: 'Get skill package detail with version history' })
  @Get('items/:id')
  getItem(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number;
    if (!userId) throw new ForbiddenException('User not authenticated');
    return this.queryService.detail(id, userId);
  }

  // GET /v1/skill/my-items — caller's own packages (created_by) across all statuses.
  @ApiOperation({ summary: "List caller's own skill packages (all statuses)" })
  @Get('my-items')
  listMyItems(@Query() q: MyItemsQueryDto, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number;
    if (!userId) throw new ForbiddenException('User not authenticated');
    return this.queryService.listMyItems(q, userId);
  }

  // GET /v1/skill/reviews — pending versions queue; service enforces scope authz (C3).
  @ApiOperation({ summary: 'Review queue (approver=all pending; else own only)' })
  @Get('reviews')
  listReviews(@Query() q: ReviewQueryDto, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number;
    if (!userId) throw new ForbiddenException('User not authenticated');
    return this.queryService.listReviews(q, userId);
  }

  // GET /v1/skill/versions/:vid/diff — service enforces owner-or-approver (C4).
  @ApiOperation({ summary: 'Get skill.md diff for a version (owner or approver only)' })
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
