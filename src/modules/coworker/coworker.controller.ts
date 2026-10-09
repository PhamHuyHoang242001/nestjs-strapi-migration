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
import { CoworkerQueryService } from './coworker-query.service';
import { CoworkerUploadService } from './coworker-upload.service';
import { CoworkerCatalogService } from './coworker-catalog.service';
import {
  CreateCoworkerPackageDto,
  CreateCoworkerVersionDto,
  ListCoworkerQueryDto,
  ListVersionsDto,
  RejectCoworkerVersionDto,
  ReviewQueryDto,
  ToggleStatusDto,
} from './dto';

@Controller('v1/ai-hub/coworker')
@ApiTags('coworker')
@ApiBearerAuth()
@UseGuards(BearerGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class CoworkerController {
  constructor(
    private readonly queryService: CoworkerQueryService,
    private readonly uploadService: CoworkerUploadService,
    private readonly catalogService: CoworkerCatalogService,
  ) {}

  @ApiOperation({ summary: 'List coworker channels' })
  @Get('channels')
  listChannels() {
    return this.catalogService.listChannels();
  }

  @ApiOperation({ summary: 'List coworker models' })
  @Get('models')
  listModels() {
    return this.catalogService.listModels();
  }

  @ApiOperation({ summary: 'List coworker packages' })
  @Get('items')
  listItems(@Query() q: ListCoworkerQueryDto, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number;
    if (!userId) throw new ForbiddenException('User not authenticated');
    return this.queryService.list(q, userId);
  }

  @ApiOperation({ summary: 'Get coworker package detail' })
  @Get('items/:id')
  getItem(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number;
    if (!userId) throw new ForbiddenException('User not authenticated');
    return this.queryService.detail(id, userId);
  }

  @ApiOperation({ summary: 'Distinct submitters of pending coworker versions (approver-only)' })
  @UseGuards(PermissionGuard)
  @RequirePermission('coworker_approve')
  @Get('reviews/submitters')
  listReviewSubmitters() {
    return this.queryService.listReviewSubmitters();
  }

  @ApiOperation({ summary: 'Review queue (approver-only pending versions)' })
  @UseGuards(PermissionGuard)
  @RequirePermission('coworker_approve')
  @Get('reviews')
  listReviews(@Query() q: ReviewQueryDto) {
    return this.queryService.listReviews(q);
  }

  @ApiOperation({ summary: 'List my coworker versions' })
  @Get('versions')
  listVersions(@Query() q: ListVersionsDto, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number;
    if (!userId) throw new ForbiddenException('User not authenticated');
    return this.queryService.listVersions(q, userId);
  }

  @ApiOperation({ summary: 'Get coworker version detail' })
  @Get('versions/:vid')
  getVersion(@Param('vid', ParseIntPipe) vid: number, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number;
    if (!userId) throw new ForbiddenException('User not authenticated');
    return this.queryService.versionDetail(vid, userId);
  }

  @ApiOperation({ summary: 'Get coworker diff (upload or approve)' })
  @UseGuards(PermissionGuard)
  @RequirePermission('coworker_upload', 'coworker_approve')
  @Get('versions/:vid/diff')
  getDiff(@Param('vid', ParseIntPipe) vid: number, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number;
    if (!userId) throw new ForbiddenException('User not authenticated');
    return this.queryService.getDiff(vid, userId);
  }

  @ApiOperation({ summary: 'Get caller coworker permission flags' })
  @Get('my-permissions')
  myPermissions(@Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number;
    if (!userId) throw new ForbiddenException('User not authenticated');
    return this.uploadService.getMyPermissions(userId);
  }

  @ApiOperation({ summary: 'Create new coworker package' })
  @Post('items')
  @UseGuards(PermissionGuard)
  @RequirePermission('coworker_upload')
  async createItem(@Body() dto: CreateCoworkerPackageDto, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number;
    if (!userId) throw new ForbiddenException('User not authenticated');
    return this.uploadService.createNew(dto, userId);
  }

  @ApiOperation({ summary: 'Submit new version of an existing coworker package' })
  @Put('items/:id/versions')
  @UseGuards(PermissionGuard)
  @RequirePermission('coworker_upload')
  async createVersion(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateCoworkerVersionDto,
    @Req() req: RequestWithInfo,
  ) {
    const userId = req.info?.user?.id as number;
    if (!userId) throw new ForbiddenException('User not authenticated');
    return this.uploadService.createVersion(id, dto, userId);
  }

  @ApiOperation({ summary: 'Edit a coworker version (submitter: latest rejected; SO: pending)' })
  @Put('versions/:vid')
  @UseGuards(PermissionGuard)
  @RequirePermission('coworker_upload', 'coworker_approve')
  async editVersion(
    @Param('vid', ParseIntPipe) vid: number,
    @Body() dto: CreateCoworkerVersionDto,
    @Req() req: RequestWithInfo,
  ) {
    const userId = req.info?.user?.id as number;
    if (!userId) throw new ForbiddenException('User not authenticated');
    return this.uploadService.editVersion(vid, dto, userId);
  }

  @ApiOperation({ summary: 'Approve a pending coworker version' })
  @Post('versions/:vid/approve')
  @UseGuards(PermissionGuard)
  @RequirePermission('coworker_approve')
  async approveVersion(@Param('vid', ParseIntPipe) vid: number, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number;
    if (!userId) throw new ForbiddenException('User not authenticated');
    return this.uploadService.approve(vid, userId);
  }

  @ApiOperation({ summary: 'Reject a pending coworker version' })
  @Post('versions/:vid/reject')
  @UseGuards(PermissionGuard)
  @RequirePermission('coworker_approve')
  async rejectVersion(
    @Param('vid', ParseIntPipe) vid: number,
    @Body() dto: RejectCoworkerVersionDto,
    @Req() req: RequestWithInfo,
  ) {
    const userId = req.info?.user?.id as number;
    if (!userId) throw new ForbiddenException('User not authenticated');
    return this.uploadService.reject(vid, dto, userId);
  }

  @ApiOperation({ summary: 'Toggle coworker package active/inactive status' })
  @Patch('items/:id/status')
  @UseGuards(PermissionGuard)
  @RequirePermission('coworker_upload', 'coworker_approve')
  async toggleStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: ToggleStatusDto, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number;
    if (!userId) throw new ForbiddenException('User not authenticated');
    return this.uploadService.toggleStatus(id, dto, userId);
  }
}
