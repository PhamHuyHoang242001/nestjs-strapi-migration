import { RequireDataAccess } from '@common/authorization/decorators/require-data-access.decorator';
import { RequireOwnerScope } from '@common/authorization/decorators/require-owner-scope.decorator';
import { RequirePermission } from '@common/authorization/decorators/require-permission.decorator';
import { OwnerScopeGuard } from '@common/authorization/guards/owner-scope.guard';
import { PermissionGuard } from '@common/authorization/guards/permission.guard';
import { DataAccessInterceptor } from '@common/authorization/interceptors/data-access.interceptor';
import { DATA_ACCESS_TABLE } from '@common/enums';
import { BearerGuard } from '@common/guards';
import { IsMaintenanceGuard } from '@common/guards/is-maintenance.guard';
import { RequestWithInfo } from '@common/types/request-with-info';
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BiPaymentTemplateService } from './bi-payment-template.service';
import { CreateBiPaymentTemplateDto } from './dto';

const TABLE = DATA_ACCESS_TABLE.BI_PAYMENT_TEMPLATES;

// Template view không có code riêng (bp_template_view đã bỏ). View ăn theo từng step (OR 5 perm).
// Strapi parity: /bi-payment/template (flat), programId via @Query.
const TEMPLATE_VIEW_PERMS = [
  'bp_program_preparing',
  'bp_program_calculating',
  'bp_program_reconciliation_bicc',
  'bp_program_reconciliation_sale',
  'bp_program_confirm_release',
];

@Controller('bi-payment/template')
@ApiTags('bi-payment-template')
@ApiBearerAuth()
@UseGuards(BearerGuard, IsMaintenanceGuard, PermissionGuard, OwnerScopeGuard)
@UseInterceptors(DataAccessInterceptor)
export class BiPaymentTemplateController {
  constructor(private readonly service: BiPaymentTemplateService) {}

  // GET /bi-payment/template — Strapi findTemplate (programId/projectId/workstepType via @Query).
  @ApiOperation({ summary: 'List BI Payment templates' })
  @Get()
  @RequirePermission(...TEMPLATE_VIEW_PERMS)
  @RequireDataAccess(TABLE)
  search(
    @Query('keyword') keyword: string,
    @Query('workstepType') workstepType: string,
    @Req() req: RequestWithInfo,
  ) {
    const userId = req.info?.user?.id as number | undefined;
    return this.service.search(
      req.info?.dataScope ?? null,
      userId ? +userId : undefined,
      workstepType,
      keyword,
    );
  }

  // GET /bi-payment/template/:id — Strapi findOneTemplate.
  @ApiOperation({ summary: 'Get BI Payment template details' })
  @Get(':id')
  @RequirePermission(...TEMPLATE_VIEW_PERMS)
  @RequireDataAccess(TABLE)
  details(@Param('id') id: number, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number | undefined;
    return this.service.details(+id, req.info?.dataScope ?? null, userId ? +userId : undefined);
  }

  // GET /bi-payment/template/:id/download — Strapi downloadTemplate.
  @ApiOperation({ summary: 'Download template metadata (view theo step)' })
  @Get(':id/download')
  @RequirePermission(...TEMPLATE_VIEW_PERMS)
  @RequireDataAccess(TABLE)
  download(@Param('id') id: number, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number | undefined;
    return this.service.download(+id, req.info?.dataScope ?? null, userId ? +userId : undefined);
  }

  // POST /bi-payment/template — Strapi createTemplate.
  @ApiOperation({ summary: 'Create / duplicate BI Payment template' })
  @Post()
  @HttpCode(200)
  @RequirePermission('bp_template_create')
  create(@Body() dto: CreateBiPaymentTemplateDto, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number | undefined;
    return this.service.create(dto, userId ? +userId : undefined);
  }

  // POST /bi-payment/template/duplicate-many — Strapi duplicateManyTemplate.
  @ApiOperation({ summary: 'Duplicate many templates' })
  @Post('duplicate-many')
  @HttpCode(200)
  @RequirePermission('bp_template_create')
  duplicateMany(
    @Body() dto: { fromProgramId?: number; fromProjectId?: number; toProgramId?: number; listTemplate: Array<{ id: number; name: string }> },
    @Req() req: RequestWithInfo,
  ) {
    const userId = req.info?.user?.id as number | undefined;
    const ids = (dto.listTemplate ?? []).map((t) => t.id);
    return this.service.duplicateMany(ids, userId ? +userId : undefined);
  }

  // DELETE /bi-payment/template/:id — Strapi deleteTemplate.
  @ApiOperation({ summary: 'Delete BI Payment template (soft delete)' })
  @Delete(':id')
  @RequirePermission('bp_template_delete')
  @RequireOwnerScope({ table: 'bi_payment_templates', scopeFromParam: 'id' })
  delete(@Param('id') id: number) {
    return this.service.delete(+id);
  }

  // DELETE /bi-payment/template/delete-many?ids=1,2,3 — Strapi deleteManyTemplate (query ids).
  @ApiOperation({ summary: 'Delete many templates' })
  @Delete('delete-many')
  @RequirePermission('bp_template_delete')
  deleteMany(@Query('ids') ids: string) {
    return this.service.deleteMany(ids);
  }

  // GET /bi-payment/template/user-created — Strapi userCreatedTemplate.
  @ApiOperation({ summary: 'Templates created by current user' })
  @Get('user-created')
  @RequirePermission(...TEMPLATE_VIEW_PERMS)
  @RequireDataAccess(TABLE)
  userCreated(@Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number | undefined;
    return this.service.listUserCreated(userId ? +userId : 0, req.info?.dataScope ?? null);
  }

  // GET /bi-payment/template/user-updated — Strapi userUpdatedTemplate.
  @ApiOperation({ summary: 'Templates updated by current user' })
  @Get('user-updated')
  @RequirePermission(...TEMPLATE_VIEW_PERMS)
  @RequireDataAccess(TABLE)
  userUpdated(@Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number | undefined;
    return this.service.listUserUpdated(userId ? +userId : 0, req.info?.dataScope ?? null);
  }
}
