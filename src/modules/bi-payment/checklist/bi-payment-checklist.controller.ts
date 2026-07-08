import { RequireDataAccess } from '@common/authorization/decorators/require-data-access.decorator';
import { RequirePermission } from '@common/authorization/decorators/require-permission.decorator';
import { OwnerScopeGuard } from '@common/authorization/guards/owner-scope.guard';
import { PermissionGuard } from '@common/authorization/guards/permission.guard';
import { DataAccessInterceptor } from '@common/authorization/interceptors/data-access.interceptor';
import { DATA_ACCESS_TABLE } from '@common/enums';
import { BearerGuard } from '@common/guards';
import { IsMaintenanceGuard } from '@common/guards/is-maintenance.guard';
import { RequestWithInfo } from '@common/types/request-with-info';
import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BiPaymentChecklistService } from './bi-payment-checklist.service';
import { CreateBiPaymentChecklistDto, UpdateBiPaymentChecklistDto } from './dto';

const TABLE = DATA_ACCESS_TABLE.BI_PAYMENT_PROGRAMS;

// Strapi parity: /bi-payment/checklist (flat), programId via @Query. Perm bp_program_preparing.
@Controller('bi-payment/checklist')
@ApiTags('bi-payment-checklist')
@ApiBearerAuth()
@UseGuards(BearerGuard, IsMaintenanceGuard, PermissionGuard, OwnerScopeGuard)
@UseInterceptors(DataAccessInterceptor)
export class BiPaymentChecklistController {
  constructor(private readonly service: BiPaymentChecklistService) {}

  // GET /bi-payment/checklist?programId=X — Strapi findChecklist.
  @ApiOperation({ summary: 'List checklist (màn chuẩn bị)' })
  @Get()
  @RequirePermission('bp_program_preparing')
  @RequireDataAccess(TABLE, 'bp_program_preparing')
  list(@Query('programId') pid: number, @Req() req: RequestWithInfo) {
    return this.service.list(+pid, req.info?.dataScope ?? null);
  }

  // POST /bi-payment/checklist — Strapi createChecklist. programId trong body (ICreateChecklist).
  @ApiOperation({ summary: 'Tạo checklist' })
  @Post()
  @RequirePermission('bp_program_preparing')
  @RequireDataAccess(TABLE, 'bp_program_preparing')
  create(@Body() dto: CreateBiPaymentChecklistDto, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number | undefined;
    return this.service.create(dto.programId, dto, req.info?.dataScope ?? null, userId ? +userId : undefined);
  }

  // PATCH /bi-payment/checklist/:id — Strapi updateChecklist.
  @ApiOperation({ summary: 'Sửa checklist' })
  @Patch(':id')
  @RequirePermission('bp_program_preparing')
  @RequireDataAccess(TABLE, 'bp_program_preparing')
  update(@Param('id') id: number, @Body() dto: UpdateBiPaymentChecklistDto, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number | undefined;
    return this.service.update(+id, dto, req.info?.dataScope ?? null, userId ? +userId : undefined);
  }

  // DELETE /bi-payment/checklist/:id — Strapi deleteChecklist.
  @ApiOperation({ summary: 'Xóa checklist' })
  @Delete(':id')
  @RequirePermission('bp_program_preparing')
  @RequireDataAccess(TABLE, 'bp_program_preparing')
  delete(@Param('id') id: number, @Req() req: RequestWithInfo) {
    return this.service.delete(+id, req.info?.dataScope ?? null);
  }

  // PATCH /bi-payment/checklist/approval — Strapi approvalChecklist (body programId).
  @ApiOperation({ summary: 'Duyệt checklist (gộp _preparing)' })
  @Patch('approval')
  @RequirePermission('bp_program_preparing')
  @RequireDataAccess(TABLE, 'bp_program_preparing')
  approve(@Body() dto: { programId: number }, @Req() req: RequestWithInfo) {
    return this.service.approve(dto.programId, req.info?.dataScope ?? null);
  }
}
