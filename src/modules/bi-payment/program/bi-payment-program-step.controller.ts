import { RequireDataAccess } from '@common/authorization/decorators/require-data-access.decorator';
import { RequirePermission } from '@common/authorization/decorators/require-permission.decorator';
import { OwnerScopeGuard } from '@common/authorization/guards/owner-scope.guard';
import { PermissionGuard } from '@common/authorization/guards/permission.guard';
import { DataAccessInterceptor } from '@common/authorization/interceptors/data-access.interceptor';
import { DATA_ACCESS_TABLE } from '@common/enums';
import { BearerGuard } from '@common/guards';
import { IsMaintenanceGuard } from '@common/guards/is-maintenance.guard';
import { RequestWithInfo } from '@common/types/request-with-info';
import { Body, Controller, Param, Patch, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BiPaymentProgramService } from './bi-payment-program.service';
import {
  NextStepDto,
  UpdateBiPaymentProgramDto,
  UpdateCalculatingWorkstepDto,
  UpdatePreparingWorkstepDto,
  UpdateReconciliationWorkstepDto,
  UpdateWaitingForApprovalWorkstepDto,
  PicConfirmFinalLinkDto,
} from './dto';

const TABLE = DATA_ACCESS_TABLE.BI_PAYMENT_PROGRAMS;

// Strapi parity: workstep PATCH endpoints mount cùng base /bi-payment/program.
// Path: PATCH /bi-payment/program/preparing-workstep/:id, /calculating-workstep/:id, v.v.
// Bỏ step gộp PATCH (/step/preparing...) — chỉ giữ Strapi workstep PATCH.
// Sale reconciliation (recon_data) KO có endpoint update program ở đây — sale chỉ tương tác file.
@Controller('bi-payment/program')
@ApiTags('bi-payment-program-step')
@ApiBearerAuth()
@UseGuards(BearerGuard, IsMaintenanceGuard, PermissionGuard, OwnerScopeGuard)
@UseInterceptors(DataAccessInterceptor)
export class BiPaymentProgramStepController {
  constructor(private readonly service: BiPaymentProgramService) {}

  // PATCH /bi-payment/program/next-step — Strapi chưa có path chuẩn; dùng body targetStep.
  // (Strapi next_step nằm trong next-step handler; giữ endpoint này cho frontend mới.)
  @ApiOperation({ summary: 'Chuyển bước program (next_step)' })
  @Patch('next-step/:id')
  @RequirePermission('bp_program_edit')
  @RequireDataAccess(TABLE, 'bp_program_edit')
  nextStep(@Param('id') id: number, @Body() dto: NextStepDto, @Req() req: RequestWithInfo) {
    return this.service.nextStep(+id, dto, req.info?.dataScope ?? null);
  }

  // ── Workstep PATCH (Strapi parity: /program/<step>-workstep/:id) ──
  @ApiOperation({ summary: 'Màn Chuẩn bị — cập nhật workstep' })
  @Patch('preparing-workstep/:id')
  @RequirePermission('bp_program_edit')
  @RequireDataAccess(TABLE, 'bp_program_edit')
  updatePreparingWorkstep(
    @Param('id') id: number,
    @Body() dto: UpdatePreparingWorkstepDto,
    @Req() req: RequestWithInfo,
  ) {
    return this.service.updatePreparing(
      +id,
      dto as unknown as Partial<UpdateBiPaymentProgramDto>,
      req.info?.dataScope ?? null,
    );
  }

  @ApiOperation({ summary: 'Màn Tính toán — cập nhật workstep' })
  @Patch('calculating-workstep/:id')
  @RequirePermission('bp_program_edit')
  @RequireDataAccess(TABLE, 'bp_program_edit')
  updateCalculatingWorkstep(
    @Param('id') id: number,
    @Body() dto: UpdateCalculatingWorkstepDto,
    @Req() req: RequestWithInfo,
  ) {
    return this.service.updateCalculating(
      +id,
      dto as unknown as Partial<UpdateBiPaymentProgramDto>,
      req.info?.dataScope ?? null,
    );
  }

  @ApiOperation({ summary: 'Màn Tra soát (BICC) — cập nhật workstep' })
  @Patch('reconciliation-workstep/:id')
  @RequirePermission('bp_program_edit')
  @RequireDataAccess(TABLE, 'bp_program_edit')
  updateReconciliationWorkstep(
    @Param('id') id: number,
    @Body() dto: UpdateReconciliationWorkstepDto,
    @Req() req: RequestWithInfo,
  ) {
    return this.service.updateReconciliationBicc(
      +id,
      dto as unknown as Partial<UpdateBiPaymentProgramDto>,
      req.info?.dataScope ?? null,
    );
  }

  @ApiOperation({ summary: 'Màn Waiting-for-approval — cập nhật workstep' })
  @Patch('waiting-for-approval-workstep/:id')
  @RequirePermission('bp_program_edit')
  @RequireDataAccess(TABLE, 'bp_program_edit')
  updateWaitingForApprovalWorkstep(
    @Param('id') id: number,
    @Body() dto: UpdateWaitingForApprovalWorkstepDto,
    @Req() req: RequestWithInfo,
  ) {
    return this.service.updateCalculating(
      +id,
      dto as unknown as Partial<UpdateBiPaymentProgramDto>,
      req.info?.dataScope ?? null,
    );
  }

  // PATCH /bi-payment/program/pic-confirm-final-link — Strapi parity (body programId).
  @ApiOperation({ summary: 'PIC confirm final link (màn confirm)' })
  @Patch('pic-confirm-final-link')
  @RequirePermission('bp_program_confirm')
  @RequireDataAccess(TABLE, 'bp_program_confirm')
  picConfirmFinalLink(@Body() dto: PicConfirmFinalLinkDto, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number | undefined;
    return this.service.picConfirmFinalLink(
      +dto.programId,
      dto,
      req.info?.dataScope ?? null,
      userId ? +userId : undefined,
    );
  }
}
