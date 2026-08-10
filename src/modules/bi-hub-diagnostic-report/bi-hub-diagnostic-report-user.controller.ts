import { RequireDataAccess } from '@common/authorization/decorators/require-data-access.decorator';
import { RequirePermission } from '@common/authorization/decorators/require-permission.decorator';
import { PermissionGuard } from '@common/authorization/guards/permission.guard';
import { DataAccessInterceptor } from '@common/authorization/interceptors/data-access.interceptor';
import { DATA_ACCESS_TABLE } from '@common/enums';
import { BearerGuard } from '@common/guards';
import { IsMaintenanceGuard } from '@common/guards/is-maintenance.guard';
import { RequestWithInfo } from '@common/types/request-with-info';
import { UserType } from '@modules/databases/user.entity';
import { Body, Controller, Get, HttpCode, Post, Param, Query, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { BiHubDiagnosticReportService } from './bi-hub-diagnostic-report.service';
import { BiHubDiagnosticReportPicService } from './bi-hub-diagnostic-report-pic.service';
import {
  SearchDiagnosticReportDto,
  SearchDiagnosticHistoryDto,
  SearchUpdatedUserDto,
  IncreaseViewDto,
  SearchPicUserDto,
  SearchPicByDepartmentDto,
} from './dto';

// User-facing diagnostic report endpoints — paths match Strapi exactly for FE compatibility
@Controller('bi-hub/diagnostic-report')
@ApiTags('bi-hub-diagnostic-report (user)')
@ApiBearerAuth()
@UseGuards(BearerGuard, IsMaintenanceGuard, PermissionGuard)
@UseInterceptors(DataAccessInterceptor)
export class BiHubDiagnosticReportUserController {
  constructor(
    private readonly service: BiHubDiagnosticReportService,
    private readonly picService: BiHubDiagnosticReportPicService,
  ) {}

  @ApiOperation({ summary: 'List diagnostic reports with pagination and data-access filtering' })
  @Get()
  @RequirePermission('bh_diag_report_view')
  @RequireDataAccess(DATA_ACCESS_TABLE.BI_HUB_DIAGNOSTIC_REPORTS, 'bh_diag_report_view')
  findAll(@Query() query: SearchDiagnosticReportDto, @Req() req: RequestWithInfo) {
    return this.service.findAll(query, req.info?.dataScope ?? null);
  }

  // Static paths BEFORE :id to avoid NestJS route collision
  @ApiOperation({ summary: 'List users who updated a report' })
  @Get('updated-user')
  @RequirePermission('bh_diag_report_view')
  @RequireDataAccess(DATA_ACCESS_TABLE.BI_HUB_DIAGNOSTIC_REPORTS, 'bh_diag_report_view')
  findUpdatedUsers(@Query() query: SearchUpdatedUserDto, @Req() req: RequestWithInfo) {
    return this.service.findUpdatedUsers(query, req.info?.dataScope ?? null);
  }

  @ApiOperation({ summary: 'List distinct updater users across all reports in a BICC department' })
  @Get('updated-user/by-department')
  @RequirePermission('bh_diag_report_view')
  findUpdatedUsersByDepartment(@Query() query: SearchPicByDepartmentDto) {
    return this.service.findUpdatedUsersByDepartment(query);
  }

  @ApiOperation({ summary: 'List history of a diagnostic report' })
  @Get('history')
  @RequirePermission('bh_diag_report_view')
  @RequireDataAccess(DATA_ACCESS_TABLE.BI_HUB_DIAGNOSTIC_REPORTS, 'bh_diag_report_view')
  findHistory(@Query() query: SearchDiagnosticHistoryDto, @Req() req: RequestWithInfo) {
    return this.service.findHistory(query, req.info?.dataScope ?? null);
  }

  @ApiOperation({ summary: 'Search users by email keyword (returns [] when no keyword)' })
  @Get('pic-users')
  @RequirePermission('bh_diag_report_view')
  searchPicUsers(@Query() query: SearchPicUserDto) {
    return this.picService.searchUsers(query);
  }

  @ApiOperation({ summary: 'List distinct PIC users across all reports in a BICC department' })
  @Get('pic-users/by-department')
  @RequirePermission('bh_diag_report_view')
  findPicUsersByDepartment(@Query() query: SearchPicByDepartmentDto) {
    return this.picService.findUsersByDepartment(query);
  }

  @ApiOperation({ summary: 'List distinct supporter users across all reports in a BICC department' })
  @Get('supporter-users/by-department')
  @RequirePermission('bh_diag_report_view')
  findSupporterUsersByDepartment(@Query() query: SearchPicByDepartmentDto) {
    return this.picService.findSupporterUsersByDepartment(query);
  }

  @ApiOperation({ summary: 'Increase view count of a report' })
  @Post('view')
  @HttpCode(200)
  // Rate limit: tối đa 5 request / phút (override throttler global permissive).
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @RequirePermission('bh_diag_report_view')
  @RequireDataAccess(DATA_ACCESS_TABLE.BI_HUB_DIAGNOSTIC_REPORTS, 'bh_diag_report_view')
  increaseView(@Body() body: IncreaseViewDto, @Req() req: RequestWithInfo) {
    return this.service.increaseView(body.reportId, req.info?.dataScope ?? null);
  }

  @ApiOperation({ summary: 'Get diagnostic report details' })
  @Get(':id')
  @RequirePermission('bh_diag_report_view')
  @RequireDataAccess(DATA_ACCESS_TABLE.BI_HUB_DIAGNOSTIC_REPORTS, 'bh_diag_report_view')
  findOne(@Param('id') id: number, @Req() req: RequestWithInfo) {
    return this.service.findOne(+id, req.info?.dataScope ?? null, {
      userId: Number(req.info?.user?.id) || null,
      isSuperAdmin: req.info?.user?.type === UserType.SUPER_ADMIN,
    });
  }
}
