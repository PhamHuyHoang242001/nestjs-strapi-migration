import { RequireDataAccess } from '@common/authorization/decorators/require-data-access.decorator';
import { RequirePermission } from '@common/authorization/decorators/require-permission.decorator';
import { OwnerScopeGuard } from '@common/authorization/guards/owner-scope.guard';
import { PermissionGuard } from '@common/authorization/guards/permission.guard';
import { DataAccessInterceptor } from '@common/authorization/interceptors/data-access.interceptor';
import { DATA_ACCESS_TABLE } from '@common/enums';
import { BearerGuard } from '@common/guards';
import { IsMaintenanceGuard } from '@common/guards/is-maintenance.guard';
import { RequestWithInfo } from '@common/types/request-with-info';
import { Controller, Get, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BiPaymentProgramService } from '../program/bi-payment-program.service';

// Top-level report endpoints — Strapi parity (/bi-payment/get-newest-updated, không nested program).
// Tách controller riêng để path top-level, không xung đột /bi-payment/program/*.
@Controller('bi-payment')
@ApiTags('bi-payment-report')
@ApiBearerAuth()
@UseGuards(BearerGuard, IsMaintenanceGuard, PermissionGuard, OwnerScopeGuard)
@UseInterceptors(DataAccessInterceptor)
export class BiPaymentReportController {
  constructor(private readonly programService: BiPaymentProgramService) {}

  // GET /bi-payment/get-newest-updated — Strapi getUpdateTimeWorkstep.
  @ApiOperation({ summary: 'Get newest-updated program' })
  @Get('get-newest-updated')
  @RequirePermission('bp_program_view')
  @RequireDataAccess(DATA_ACCESS_TABLE.BI_PAYMENT_PROGRAMS, 'bp_program_view')
  getNewestUpdated(@Req() req: RequestWithInfo) {
    return this.programService.getNewestUpdated(req.info?.dataScope ?? null);
  }
}
