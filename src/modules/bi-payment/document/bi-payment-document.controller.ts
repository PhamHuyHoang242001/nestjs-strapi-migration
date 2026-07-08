import { RequireDataAccess } from '@common/authorization/decorators/require-data-access.decorator';
import { RequirePermission } from '@common/authorization/decorators/require-permission.decorator';
import { OwnerScopeGuard } from '@common/authorization/guards/owner-scope.guard';
import { PermissionGuard } from '@common/authorization/guards/permission.guard';
import { DataAccessInterceptor } from '@common/authorization/interceptors/data-access.interceptor';
import { DATA_ACCESS_TABLE } from '@common/enums';
import { BearerGuard } from '@common/guards';
import { IsMaintenanceGuard } from '@common/guards/is-maintenance.guard';
import { RequestWithInfo } from '@common/types/request-with-info';
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BiPaymentDocumentService } from './bi-payment-document.service';
import { SearchBiPaymentDocumentDto, UploadBiPaymentDocumentDto } from './dto';

const TABLE = DATA_ACCESS_TABLE.BI_PAYMENT_PROGRAMS;

// Strapi parity: /bi-payment/document (flat), programId via @Query. File ăn theo step perm.
// Guard order LOCKED. Sale chỉ upload+view recon_data (verb-gate _sale chặn download/delete).
@Controller('bi-payment/document')
@ApiTags('bi-payment-document')
@ApiBearerAuth()
@UseGuards(BearerGuard, IsMaintenanceGuard, PermissionGuard, OwnerScopeGuard)
@UseInterceptors(DataAccessInterceptor)
export class BiPaymentDocumentController {
  constructor(private readonly service: BiPaymentDocumentService) {}

  // GET /bi-payment/document?programId=X&workstep=prepare — Strapi findDocument.
  // workstep query (EworkstepType) xác định perm step; service map workstep→perm.
  @ApiOperation({ summary: 'List documents (filter by workstep)' })
  @Get()
  @RequirePermission('bp_program_preparing', 'bp_program_calculating', 'bp_program_reconciliation_bicc', 'bp_program_reconciliation_sale', 'bp_program_confirm_release')
  @RequireDataAccess(TABLE)
  list(@Query() q: SearchBiPaymentDocumentDto, @Req() req: RequestWithInfo) {
    const programId = q.programId ? Number(q.programId) : undefined;
    return this.service.list(programId, q, req.info?.dataScope ?? null);
  }

  // GET /bi-payment/document/:id — Strapi findOneDocument.
  @ApiOperation({ summary: 'Get document detail' })
  @Get(':id')
  @RequirePermission('bp_program_preparing', 'bp_program_calculating', 'bp_program_reconciliation_bicc', 'bp_program_reconciliation_sale', 'bp_program_confirm_release')
  @RequireDataAccess(TABLE)
  details(@Param('id') id: number, @Req() req: RequestWithInfo) {
    return this.service.download(+id, req.info?.dataScope ?? null);
  }

  // GET /bi-payment/document/:id/download — Strapi downloadDocument.
  @ApiOperation({ summary: 'Download document' })
  @Get(':id/download')
  @RequirePermission('bp_program_preparing', 'bp_program_calculating', 'bp_program_reconciliation_bicc', 'bp_program_confirm_release')
  @RequireDataAccess(TABLE)
  download(@Param('id') id: number, @Req() req: RequestWithInfo) {
    return this.service.download(+id, req.info?.dataScope ?? null);
  }

  // POST /bi-payment/document — Strapi createDocument. workStep trong body (EworkstepType).
  @ApiOperation({ summary: 'Upload document' })
  @Post()
  @RequirePermission('bp_program_preparing', 'bp_program_calculating', 'bp_program_reconciliation_bicc', 'bp_program_reconciliation_sale', 'bp_program_confirm_release')
  @RequireDataAccess(TABLE)
  upload(@Body() dto: UploadBiPaymentDocumentDto, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number | undefined;
    return this.service.upload(dto, req.info?.dataScope ?? null, userId ? +userId : undefined);
  }

  // DELETE /bi-payment/document/:id — Strapi deleteDocument.
  @ApiOperation({ summary: 'Delete document (soft delete)' })
  @Delete(':id')
  @RequirePermission('bp_program_preparing', 'bp_program_reconciliation_bicc', 'bp_program_confirm_release')
  @RequireDataAccess(TABLE)
  delete(@Param('id') id: number, @Req() req: RequestWithInfo) {
    return this.service.delete(+id, req.info?.dataScope ?? null);
  }

  // PATCH /bi-payment/document/update-status — Strapi updateStatusDocument (body docId+status).
  @ApiOperation({ summary: 'Update document status' })
  @Patch('update-status')
  @RequirePermission('bp_program_preparing', 'bp_program_reconciliation_bicc')
  @RequireDataAccess(TABLE)
  updateStatus(@Body() dto: { documentId: number; status: string }, @Req() req: RequestWithInfo) {
    return this.service.updateStatus(dto.documentId, dto.status, req.info?.dataScope ?? null);
  }

  // POST /bi-payment/document/merge-file — Strapi mergeFile.
  @ApiOperation({ summary: 'Merge documents' })
  @Post('merge-file')
  @RequirePermission('bp_program_confirm_release')
  @RequireDataAccess(TABLE, 'bp_program_confirm_release')
  merge(@Body() dto: { documentIds: number[]; mode: 'csv' | 'excel'; programId?: number }, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number | undefined;
    return this.service.merge(dto.programId ?? 0, dto.documentIds, dto.mode, req.info?.dataScope ?? null, userId ? +userId : undefined);
  }

  // GET /bi-payment/document/get-merged-status-reconcilation/:id — Strapi.
  @ApiOperation({ summary: 'Get merge status' })
  @Get('get-merged-status-reconcilation/:id')
  @RequirePermission('bp_program_confirm_release')
  @RequireDataAccess(TABLE, 'bp_program_confirm_release')
  getMergeStatus(@Param('id') id: number, @Req() req: RequestWithInfo) {
    return this.service.getMergeStatus(+id, req.info?.dataScope ?? null);
  }

  // GET /bi-payment/document/download-merged-reconcilation/:id — Strapi.
  @ApiOperation({ summary: 'Download merged file' })
  @Get('download-merged-reconcilation/:id')
  @RequirePermission('bp_program_confirm_release')
  @RequireDataAccess(TABLE, 'bp_program_confirm_release')
  downloadMerged(@Param('id') id: number, @Req() req: RequestWithInfo) {
    return this.service.downloadMerged(+id, req.info?.dataScope ?? null);
  }

  // ── Report endpoints (Strapi parity) ──
  @ApiOperation({ summary: 'Document stats by status' })
  @Get('stats')
  @RequirePermission('bp_program_view')
  @RequireDataAccess(TABLE, 'bp_program_view')
  stats(@Query('programId') pid: number, @Req() req: RequestWithInfo) {
    return this.service.stats(+pid, req.info?.dataScope ?? null);
  }

  @ApiOperation({ summary: 'Document upload-status stats' })
  @Get('upload-status')
  @RequirePermission('bp_program_view')
  @RequireDataAccess(TABLE, 'bp_program_view')
  uploadStatus(@Query('programId') pid: number, @Req() req: RequestWithInfo) {
    return this.service.uploadStatus(+pid, req.info?.dataScope ?? null);
  }

  @ApiOperation({ summary: 'Documents created by current user' })
  @Get('user-created')
  @RequirePermission('bp_program_view')
  @RequireDataAccess(TABLE, 'bp_program_view')
  userCreated(@Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number | undefined;
    return this.service.listUserCreated(userId ? +userId : 0, req.info?.dataScope ?? null);
  }

  @ApiOperation({ summary: 'Documents updated by current user' })
  @Get('user-updated')
  @RequirePermission('bp_program_view')
  @RequireDataAccess(TABLE, 'bp_program_view')
  userUpdated(@Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number | undefined;
    return this.service.listUserUpdated(userId ? +userId : 0, req.info?.dataScope ?? null);
  }

  @ApiOperation({ summary: 'Documents approved' })
  @Get('user-approved')
  @RequirePermission('bp_program_view')
  @RequireDataAccess(TABLE, 'bp_program_view')
  userApproved(@Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number | undefined;
    return this.service.listUserApproved(userId ? +userId : 0, req.info?.dataScope ?? null);
  }

  @ApiOperation({ summary: 'Documents rejected by current user' })
  @Get('user-rejected')
  @RequirePermission('bp_program_view')
  @RequireDataAccess(TABLE, 'bp_program_view')
  userRejected(@Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number | undefined;
    return this.service.listUserRejected(userId ? +userId : 0, req.info?.dataScope ?? null);
  }
}
