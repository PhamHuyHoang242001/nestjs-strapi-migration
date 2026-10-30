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
import { DataHubDataServiceDetailQueryService } from './data-hub-data-service-detail-query.service';
import { DataHubDataServiceTermsQueryService } from './data-hub-data-service-terms-query.service';
import { DataHubDataServiceExportService } from './data-hub-data-service-export.service';
import { DataHubDataServiceHistoryService } from './data-hub-data-service-history.service';
import { DataHubDataServiceListQueryService } from './data-hub-data-service-list-query.service';
import { DataHubDataServiceWriteService } from './data-hub-data-service-write.service';
import {
  CreateDataServiceDto,
  ExportDataServiceQueryDto,
  ListDataServiceQueryDto,
  UpdateDataServiceDto,
  UpdateDataServiceStatusDto,
} from './dto';

// Reads need only a logged-in user. Writes need the data-service code (guard) and membership of the
// service's department (checked by the write service inside its transaction).
const requireUserId = (req: RequestWithInfo): number => {
  const userId = req.info?.user?.id as number | undefined;
  if (!userId) throw new ForbiddenException('User not authenticated');
  return userId;
};

@Controller('v1/data-hub/data-services')
@ApiTags('data-hub-data-services')
@ApiBearerAuth()
@UseGuards(BearerGuard, DataHubPermissionGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class DataHubDataServiceController {
  constructor(
    private readonly listQuery: DataHubDataServiceListQueryService,
    private readonly detailQuery: DataHubDataServiceDetailQueryService,
    private readonly termsQuery: DataHubDataServiceTermsQueryService,
    private readonly historyService: DataHubDataServiceHistoryService,
    private readonly writeService: DataHubDataServiceWriteService,
    private readonly exportService: DataHubDataServiceExportService,
    private readonly access: DataHubAccessService,
  ) {}

  @ApiOperation({ summary: 'List data services (catalog)' })
  @Get()
  async list(@Query() q: ListDataServiceQueryDto, @Req() req: RequestWithInfo) {
    // Dịch vụ ngừng hoạt động chỉ hiện cho thành viên đơn vị phát hành của nó (super_admin xem hết).
    const inactiveDepartmentIds = await this.access.inactiveServiceDepartmentIds(dataHubCaller(req));
    return this.listQuery.list(q, inactiveDepartmentIds);
  }

  @ApiOperation({ summary: 'Export filtered data services to XLSX (max 5000 rows)' })
  @Get('export')
  async export(@Query() q: ExportDataServiceQueryDto, @Req() req: RequestWithInfo, @Res() res: Response) {
    const inactiveDepartmentIds = await this.access.inactiveServiceDepartmentIds(dataHubCaller(req));
    await this.exportService.export(q, inactiveDepartmentIds, res);
  }

  @ApiOperation({ summary: 'Create a data service (version 1, auto-approved)' })
  @Post()
  @RequireDataHubPermission(DH_PERMISSIONS.DATA_SERVICE_CREATE)
  create(@Body() dto: CreateDataServiceDto, @Req() req: RequestWithInfo) {
    return this.writeService.create(dto, dataHubCaller(req));
  }

  @ApiOperation({ summary: 'Data service detail (active version)' })
  @Get(':id')
  async detail(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithInfo) {
    const caller = dataHubCaller(req);
    const item = await this.detailQuery.detail(id);
    // Đơn vị phát hành lives on the active version.
    const departmentId = item.version_active?.department?.id ?? null;
    return { ...item, is_update: await this.access.canUpdateDataService(caller, departmentId) };
  }

  @ApiOperation({ summary: 'Source tables (bảng nguồn) of the active version, paged, with their term count' })
  @Get(':id/source-tables')
  sourceTables(@Param('id', ParseIntPipe) id: number, @Query() q: DataHubPageQueryDto, @Req() req: RequestWithInfo) {
    requireUserId(req);
    return this.termsQuery.sourceTables(id, q);
  }

  @ApiOperation({ summary: 'Physical terms of the active version inside one source table' })
  @Get(':id/source-tables/:sourceTableId/terms')
  sourceTableTerms(
    @Param('id', ParseIntPipe) id: number,
    @Param('sourceTableId', ParseIntPipe) sourceTableId: number,
    @Req() req: RequestWithInfo,
  ) {
    requireUserId(req);
    return this.termsQuery.sourceTableTerms(id, sourceTableId);
  }

  @ApiOperation({ summary: 'Edit a data service (creates a new auto-approved version)' })
  @Put(':id')
  @RequireDataHubPermission(DH_PERMISSIONS.DATA_SERVICE_UPDATE)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateDataServiceDto, @Req() req: RequestWithInfo) {
    return this.writeService.update(id, dto, dataHubCaller(req));
  }

  @ApiOperation({ summary: 'Activate / deactivate a data service' })
  @Patch(':id/status')
  @RequireDataHubPermission(DH_PERMISSIONS.DATA_SERVICE_UPDATE)
  setStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDataServiceStatusDto,
    @Req() req: RequestWithInfo,
  ) {
    return this.writeService.setStatus(id, dto.status, dataHubCaller(req));
  }

  @ApiOperation({ summary: 'Change log of a data service' })
  @Get(':id/histories')
  histories(@Param('id', ParseIntPipe) id: number, @Query() q: DataHubPageQueryDto, @Req() req: RequestWithInfo) {
    requireUserId(req);
    return this.historyService.listHistories(id, q);
  }

  @ApiOperation({ summary: 'One change log entry with its field diff' })
  @Get(':id/histories/:historyId')
  historyDetail(
    @Param('id', ParseIntPipe) id: number,
    @Param('historyId', ParseIntPipe) historyId: number,
    @Req() req: RequestWithInfo,
  ) {
    requireUserId(req);
    return this.historyService.historyDetail(id, historyId);
  }

  @ApiOperation({ summary: 'Versions of a data service' })
  @Get(':id/versions')
  versions(@Param('id', ParseIntPipe) id: number, @Query() q: DataHubPageQueryDto, @Req() req: RequestWithInfo) {
    requireUserId(req);
    return this.historyService.listVersions(id, q);
  }
}
