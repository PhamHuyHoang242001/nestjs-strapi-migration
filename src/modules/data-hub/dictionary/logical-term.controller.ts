import { BearerGuard } from '@common/guards/bearer.guard';
import { RequestWithInfo } from '@common/types/request-with-info';
import { exportExcelToResponse } from '@common/utils/export-excel.helper';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
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
import { ListLogicalTermQueryDto, LogicalTermBodyDto } from './dto';
import { LogicalTermExportService, LOGICAL_TERM_EXPORT_COLUMNS } from './logical-term-export.service';
import { LogicalTermHistoryService } from './logical-term-history.service';
import { LogicalTermQueryService } from './logical-term-query.service';
import { LogicalTermWriteService } from './logical-term-write.service';

const requireUserId = (req: RequestWithInfo): number => {
  const userId = req.info?.user?.id as number;
  if (!userId) throw new ForbiddenException('User not authenticated');
  return userId;
};

// Static routes (systems-out, options, export) are declared before ':id'.
@Controller('v1/data-hub/logical-terms')
@ApiTags('data-hub-logical-terms')
@ApiBearerAuth()
@UseGuards(BearerGuard, DataHubPermissionGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class LogicalTermController {
  constructor(
    private readonly queryService: LogicalTermQueryService,
    private readonly writeService: LogicalTermWriteService,
    private readonly historyService: LogicalTermHistoryService,
    private readonly exportService: LogicalTermExportService,
    private readonly access: DataHubAccessService,
  ) {}

  @ApiOperation({ summary: 'Logical terms tree with physical terms and systems out' })
  @Get()
  list(@Query() q: ListLogicalTermQueryDto, @Req() req: RequestWithInfo) {
    requireUserId(req);
    return this.queryService.list(q);
  }

  @ApiOperation({ summary: 'Consumers receiving dictionary terms (filter dropdown)' })
  @Get('systems-out')
  systemsOut(@Req() req: RequestWithInfo) {
    requireUserId(req);
    return this.queryService.systemsOut();
  }

  @ApiOperation({ summary: 'Logical term picker: {id, code, short_description}, A→Z' })
  @Get('options')
  options(@Query() q: DataHubPageQueryDto, @Req() req: RequestWithInfo) {
    requireUserId(req);
    return this.queryService.options(q);
  }

  @ApiOperation({ summary: 'Export dictionary to xlsx (one row per physical term)' })
  @Get('export')
  async export(@Query() q: ListLogicalTermQueryDto, @Req() req: RequestWithInfo, @Res() res: Response) {
    requireUserId(req);
    const rows = await this.exportService.buildRows(q);
    await exportExcelToResponse(res, { sheetName: 'logical-terms', columns: LOGICAL_TERM_EXPORT_COLUMNS, rows });
  }

  @ApiOperation({ summary: 'Logical term detail' })
  @Get(':id')
  async getById(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithInfo) {
    const caller = dataHubCaller(req);
    const [item, isUpdate] = await Promise.all([
      this.queryService.getById(id),
      this.access.hasCode(caller, DH_PERMISSIONS.LOGICAL_TERM_UPDATE),
    ]);
    return { ...item, is_update: isUpdate };
  }

  @ApiOperation({ summary: 'Logical term version history (snapshots)' })
  @Get(':id/histories')
  histories(@Param('id', ParseIntPipe) id: number, @Query() q: DataHubPageQueryDto, @Req() req: RequestWithInfo) {
    requireUserId(req);
    return this.historyService.list(id, q);
  }

  @ApiOperation({ summary: 'Create logical term and map physical terms' })
  @Post()
  @RequireDataHubPermission(DH_PERMISSIONS.LOGICAL_TERM_CREATE)
  create(@Body() dto: LogicalTermBodyDto, @Req() req: RequestWithInfo) {
    return this.writeService.create(dto, requireUserId(req));
  }

  @ApiOperation({ summary: 'Replace logical term fields and its physical term set' })
  @Put(':id')
  @RequireDataHubPermission(DH_PERMISSIONS.LOGICAL_TERM_UPDATE)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: LogicalTermBodyDto, @Req() req: RequestWithInfo) {
    return this.writeService.update(id, dto, requireUserId(req));
  }
}
