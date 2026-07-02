import { RequireDataAccess } from '@common/authorization/decorators/require-data-access.decorator';
import { RequirePermission } from '@common/authorization/decorators/require-permission.decorator';
import { PermissionGuard } from '@common/authorization/guards/permission.guard';
import { DataAccessInterceptor } from '@common/authorization/interceptors/data-access.interceptor';
import { DATA_ACCESS_TABLE } from '@common/enums';
import { BearerGuard } from '@common/guards';
import { IsMaintenanceGuard } from '@common/guards/is-maintenance.guard';
import { RequestWithInfo } from '@common/types/request-with-info';
import { Controller, Get, Param, Query, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MaToolReportService } from './ma-tool-report.service';
import { SearchMaToolReportDto } from './dto/search-ma-tool-report.dto';

const VIEW = 'ma_tool_report_view';

// MA Tool CSTB report — read-only, explicit-only data scope.
// Guard/interceptor order mirrors the diagnostic user controller exactly.
@Controller('ma-tool/report')
@ApiTags('ma-tool-report')
@ApiBearerAuth()
@UseGuards(BearerGuard, IsMaintenanceGuard, PermissionGuard)
@UseInterceptors(DataAccessInterceptor)
export class MaToolReportController {
  constructor(private readonly service: MaToolReportService) {}

  @ApiOperation({ summary: 'List MA Tool reports with pagination and data-access filtering' })
  @Get()
  @RequirePermission(VIEW)
  @RequireDataAccess(DATA_ACCESS_TABLE.MA_TOOL_CSTB_RPT_PROPERTIES, VIEW)
  findAll(@Query() query: SearchMaToolReportDto, @Req() req: RequestWithInfo) {
    return this.service.findAll(query, req.info?.dataScope ?? null);
  }

  @ApiOperation({ summary: 'Get MA Tool report details' })
  @Get(':id')
  @RequirePermission(VIEW)
  @RequireDataAccess(DATA_ACCESS_TABLE.MA_TOOL_CSTB_RPT_PROPERTIES, VIEW)
  findOne(@Param('id') id: number, @Req() req: RequestWithInfo) {
    return this.service.findOne(+id, req.info?.dataScope ?? null);
  }
}
