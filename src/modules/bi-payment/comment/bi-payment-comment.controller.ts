import { RequireDataAccess } from '@common/authorization/decorators/require-data-access.decorator';
import { RequirePermission } from '@common/authorization/decorators/require-permission.decorator';
import { OwnerScopeGuard } from '@common/authorization/guards/owner-scope.guard';
import { PermissionGuard } from '@common/authorization/guards/permission.guard';
import { DataAccessInterceptor } from '@common/authorization/interceptors/data-access.interceptor';
import { DATA_ACCESS_TABLE } from '@common/enums';
import { BearerGuard } from '@common/guards';
import { IsMaintenanceGuard } from '@common/guards/is-maintenance.guard';
import { RequestWithInfo } from '@common/types/request-with-info';
import { Body, Controller, Get, Post, Query, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BiPaymentCommentService } from './bi-payment-comment.service';
import { CreateBiPaymentCommentDto } from './dto';

const TABLE = DATA_ACCESS_TABLE.BI_PAYMENT_PROGRAMS;

// Strapi parity: /bi-payment/comment (flat), programId+workStep trong body/query.
// Comment không code riêng — ăn theo step perm (workStep trong body ICreateComment).
@Controller('bi-payment/comment')
@ApiTags('bi-payment-comment')
@ApiBearerAuth()
@UseGuards(BearerGuard, IsMaintenanceGuard, PermissionGuard, OwnerScopeGuard)
@UseInterceptors(DataAccessInterceptor)
export class BiPaymentCommentController {
  constructor(private readonly service: BiPaymentCommentService) {}

  // GET /bi-payment/comment?programId=X&workStep=preparing — Strapi findComment.
  @ApiOperation({ summary: 'List comments by workstep' })
  @Get()
  @RequirePermission('bp_program_preparing', 'bp_program_reconciliation_bicc', 'bp_program_reconciliation_sale')
  @RequireDataAccess(TABLE)
  list(@Query('programId') pid: number, @Query('workStep') workStep: string, @Req() req: RequestWithInfo) {
    return this.service.list(+pid, workStep, req.info?.dataScope ?? null);
  }

  // POST /bi-payment/comment — Strapi createComment. workStep trong body (ICreateComment).
  @ApiOperation({ summary: 'Create comment' })
  @Post()
  @RequirePermission('bp_program_preparing', 'bp_program_reconciliation_bicc', 'bp_program_reconciliation_sale')
  @RequireDataAccess(TABLE)
  create(@Body() dto: CreateBiPaymentCommentDto, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number | undefined;
    return this.service.create(dto.programId, dto.workStep, dto, req.info?.dataScope ?? null, userId ? +userId : undefined);
  }
}
