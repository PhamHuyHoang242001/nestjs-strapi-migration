import { RequireDataAccess } from '@common/authorization/decorators/require-data-access.decorator';
import { RequirePermission } from '@common/authorization/decorators/require-permission.decorator';
import { PermissionGuard } from '@common/authorization/guards/permission.guard';
import { DataAccessInterceptor } from '@common/authorization/interceptors/data-access.interceptor';
import { DATA_ACCESS_TABLE } from '@common/enums';
import { BearerGuard } from '@common/guards';
import { IsMaintenanceGuard } from '@common/guards/is-maintenance.guard';
import { RequestWithInfo } from '@common/types/request-with-info';
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BiHubDiagnosticReportWriteService } from './bi-hub-diagnostic-report-write.service';
import { CreateDiagnosticReportDto, UpdateDiagnosticReportDto, DeleteManyDiagnosticReportDto, DownloadDiagnosticReportDto } from './dto';

// Admin diagnostic report endpoints — paths match Strapi exactly for FE compatibility
// Auth is unified (user + role + data_access), NOT old admin auth
@Controller()
@ApiTags('bi-hub-diagnostic-report (admin)')
@ApiBearerAuth()
@UseGuards(BearerGuard, IsMaintenanceGuard, PermissionGuard)
@UseInterceptors(DataAccessInterceptor)
export class BiHubDiagnosticReportAdminController {
  constructor(private readonly service: BiHubDiagnosticReportWriteService) {}

  // Static paths BEFORE :id to avoid route collision
  @ApiOperation({ summary: 'Download diagnostic reports' })
  @Get('admin/diagnostic/report/download')
  @RequirePermission('bh_diag_report_download')
  @RequireDataAccess(DATA_ACCESS_TABLE.BI_HUB_DIAGNOSTIC_REPORTS, 'bh_diag_report_download')
  download(@Query() query: DownloadDiagnosticReportDto, @Req() req: RequestWithInfo) {
    return this.service.download(query, req.info?.accessibleDataIds);
  }

  @ApiOperation({ summary: 'Create diagnostic report' })
  @Post('admin/diagnostic/report')
  @HttpCode(200)
  @RequirePermission('bh_diag_report_create')
  create(@Body() body: CreateDiagnosticReportDto, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id;
    return this.service.create(body, +userId);
  }

  @ApiOperation({ summary: 'Update diagnostic report' })
  @Patch('admin/diagnostic/report/:id')
  @RequirePermission('bh_diag_report_edit')
  @RequireDataAccess(DATA_ACCESS_TABLE.BI_HUB_DIAGNOSTIC_REPORTS, 'bh_diag_report_edit')
  update(@Param('id') id: number, @Body() body: UpdateDiagnosticReportDto, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id;
    return this.service.update(+id, body, +userId, req.info?.accessibleDataIds);
  }

  @ApiOperation({ summary: 'Delete multiple diagnostic reports' })
  @Delete('admin/diagnostic/report')
  @RequirePermission('bh_diag_report_delete')
  @RequireDataAccess(DATA_ACCESS_TABLE.BI_HUB_DIAGNOSTIC_REPORTS, 'bh_diag_report_delete')
  deleteMany(@Query() query: DeleteManyDiagnosticReportDto, @Req() req: RequestWithInfo) {
    return this.service.deleteMany(query.ids, req.info?.accessibleDataIds);
  }

  @ApiOperation({ summary: 'Delete single diagnostic report' })
  @Delete('admin/diagnostic/report/:id')
  @RequirePermission('bh_diag_report_delete')
  @RequireDataAccess(DATA_ACCESS_TABLE.BI_HUB_DIAGNOSTIC_REPORTS, 'bh_diag_report_delete')
  deleteOne(@Param('id') id: number, @Req() req: RequestWithInfo) {
    return this.service.deleteOne(+id, req.info?.accessibleDataIds);
  }

  @ApiOperation({ summary: 'Sync group BI manager to diagnostic reports' })
  @Patch('admin/diagnostic/sync-group-manager')
  @RequirePermission('bh_diag_report_edit')
  syncGroupManager() {
    return this.service.syncGroupManager();
  }
}
