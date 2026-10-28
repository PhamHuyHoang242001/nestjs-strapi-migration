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
import { Response } from 'express';
import { DataHubAccessService } from '../common/data-hub-access.service';
import { dataHubCaller } from '../common/data-hub-caller.util';
import { DH_PERMISSIONS } from '../common/data-hub-permission-codes';
import { DataHubPermissionGuard, RequireDataHubPermission } from '../common/data-hub-permission.guard';
import { DataHubPageQueryDto } from '../common/data-hub-query.util';
import { DataHubConsumerExportService } from './data-hub-consumer-export.service';
import { DataHubConsumerQueryService } from './data-hub-consumer-query.service';
import { DataHubConsumerTermsQueryService } from './data-hub-consumer-terms-query.service';
import { DataHubConsumerWriteService } from './data-hub-consumer-write.service';
import { CreateConsumerDto, ListConsumerQueryDto, UpdateConsumerDto, UpdateConsumerStatusDto } from './dto';

// Reads need only a logged-in user; writes need the consumer codes (DataHubPermissionGuard).
const requireUserId = (req: RequestWithInfo): number => {
  const userId = req.info?.user?.id as number;
  if (!userId) throw new ForbiddenException('User not authenticated');
  return userId;
};

@Controller('v1/data-hub/consumers')
@ApiTags('data-hub-consumers')
@ApiBearerAuth()
@UseGuards(BearerGuard, DataHubPermissionGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class DataHubConsumerController {
  constructor(
    private readonly queryService: DataHubConsumerQueryService,
    private readonly writeService: DataHubConsumerWriteService,
    private readonly exportService: DataHubConsumerExportService,
    private readonly access: DataHubAccessService,
    private readonly termsQuery: DataHubConsumerTermsQueryService,
  ) {}

  @ApiOperation({ summary: 'List consumer apps' })
  @Get()
  list(@Query() q: ListConsumerQueryDto, @Req() req: RequestWithInfo) {
    requireUserId(req);
    return this.queryService.list(q);
  }

  // Static routes stay above ':id' so they are not parsed as ids.
  @ApiOperation({ summary: 'Export consumers to XLSX' })
  @Get('export')
  async export(@Query() q: ListConsumerQueryDto, @Req() req: RequestWithInfo, @Res() res: Response) {
    requireUserId(req);
    await this.exportService.export(q, res);
  }

  @ApiOperation({ summary: 'Consumer detail' })
  @Get(':id')
  async detail(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithInfo) {
    const caller = dataHubCaller(req);
    const [item, isUpdate] = await Promise.all([
      this.queryService.detail(id),
      this.access.hasCode(caller, DH_PERMISSIONS.CONSUMER_UPDATE),
    ]);
    return { ...item, is_update: isUpdate };
  }

  @ApiOperation({ summary: 'Source tables (bảng nguồn) of the terms the consumer receives, paged' })
  @Get(':id/source-tables')
  sourceTables(@Param('id', ParseIntPipe) id: number, @Query() q: DataHubPageQueryDto, @Req() req: RequestWithInfo) {
    requireUserId(req);
    return this.termsQuery.sourceTables(id, q);
  }

  @ApiOperation({ summary: 'Terms the consumer receives inside one source table, with the providing service' })
  @Get(':id/source-tables/:sourceTableId/terms')
  sourceTableTerms(
    @Param('id', ParseIntPipe) id: number,
    @Param('sourceTableId', ParseIntPipe) sourceTableId: number,
    @Req() req: RequestWithInfo,
  ) {
    requireUserId(req);
    return this.termsQuery.sourceTableTerms(id, sourceTableId);
  }

  @ApiOperation({ summary: 'Consumer version history' })
  @Get(':id/histories')
  histories(@Param('id', ParseIntPipe) id: number, @Query() q: DataHubPageQueryDto, @Req() req: RequestWithInfo) {
    requireUserId(req);
    return this.queryService.histories(id, q);
  }

  @ApiOperation({ summary: 'Create consumer' })
  @Post()
  @RequireDataHubPermission(DH_PERMISSIONS.CONSUMER_CREATE)
  create(@Body() dto: CreateConsumerDto, @Req() req: RequestWithInfo) {
    return this.writeService.create(dto, requireUserId(req));
  }

  @ApiOperation({ summary: 'Update consumer (code is immutable)' })
  @Put(':id')
  @RequireDataHubPermission(DH_PERMISSIONS.CONSUMER_UPDATE)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateConsumerDto, @Req() req: RequestWithInfo) {
    return this.writeService.update(id, dto, requireUserId(req));
  }

  @ApiOperation({ summary: 'Activate / deactivate consumer' })
  @Patch(':id/status')
  @RequireDataHubPermission(DH_PERMISSIONS.CONSUMER_UPDATE)
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateConsumerStatusDto,
    @Req() req: RequestWithInfo,
  ) {
    return this.writeService.updateStatus(id, dto.status, requireUserId(req));
  }
}
