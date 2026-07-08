import { RequireDataAccess } from '@common/authorization/decorators/require-data-access.decorator';
import { RequirePermission } from '@common/authorization/decorators/require-permission.decorator';
import { OwnerScopeGuard } from '@common/authorization/guards/owner-scope.guard';
import { PermissionGuard } from '@common/authorization/guards/permission.guard';
import { DataAccessInterceptor } from '@common/authorization/interceptors/data-access.interceptor';
import { BearerGuard } from '@common/guards';
import { IsMaintenanceGuard } from '@common/guards/is-maintenance.guard';
import { RequestWithInfo } from '@common/types/request-with-info';
import { Controller, Get, Param, Query, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BiPaymentHistoryService } from './bi-payment-history.service';
import { SearchBiPaymentProgramHistoryDto, SearchBiPaymentProjectHistoryDto } from './dto';

// Strapi parity: /bi-payment/program-history, /bi-payment/program-log-change, /bi-payment/project-history.
// Audit read-only. Perm bp_program_view / bp_project_view. Record-scope subtree program/project.
@Controller()
@ApiTags('bi-payment-history')
@ApiBearerAuth()
@UseGuards(BearerGuard, IsMaintenanceGuard, PermissionGuard, OwnerScopeGuard)
@UseInterceptors(DataAccessInterceptor)
export class BiPaymentHistoryController {
  constructor(private readonly service: BiPaymentHistoryService) {}

  // GET /bi-payment/program-history — Strapi findProgramHistory.
  @ApiOperation({ summary: 'List program histories' })
  @Get('bi-payment/program-history')
  @RequirePermission('bp_program_view')
  @RequireDataAccess('bi_payment_program_histories', 'bp_program_view')
  listProgramHistory(@Query() query: SearchBiPaymentProgramHistoryDto, @Req() req: RequestWithInfo) {
    return this.service.listProgramHistory(query, req.info?.dataScope ?? null);
  }

  // GET /bi-payment/program-history/:id — Strapi findOneProgramHistory.
  @ApiOperation({ summary: 'Get program history detail' })
  @Get('bi-payment/program-history/:id')
  @RequirePermission('bp_program_view')
  @RequireDataAccess('bi_payment_program_histories', 'bp_program_view')
  getProgramHistoryDetail(@Param('id') id: number, @Req() req: RequestWithInfo) {
    return this.service.getProgramHistoryDetail(+id, req.info?.dataScope ?? null);
  }

  // GET /bi-payment/program-log-change — Strapi findProgramLogChange.
  @ApiOperation({ summary: 'List program log changes' })
  @Get('bi-payment/program-log-change')
  @RequirePermission('bp_program_view')
  @RequireDataAccess('bi_payment_program_log_changes', 'bp_program_view')
  listProgramLogChange(@Query('programId') programId: number, @Req() req: RequestWithInfo) {
    return this.service.listProgramLogChange(+programId, req.info?.dataScope ?? null);
  }

  // GET /bi-payment/project-history — Strapi findProjectHistory (admin gộp, perm bp_project_view).
  @ApiOperation({ summary: 'List project histories' })
  @Get('bi-payment/project-history')
  @RequirePermission('bp_project_view')
  @RequireDataAccess('bi_payment_project_histories', 'bp_project_view')
  listProjectHistory(@Query() query: SearchBiPaymentProjectHistoryDto, @Req() req: RequestWithInfo) {
    return this.service.listProjectHistory(query, req.info?.dataScope ?? null);
  }
}
