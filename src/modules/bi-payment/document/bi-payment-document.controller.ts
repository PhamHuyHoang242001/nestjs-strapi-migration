import { RequirePermission } from '@common/authorization/decorators/require-permission.decorator';
import { OwnerScopeGuard } from '@common/authorization/guards/owner-scope.guard';
import { PermissionGuard } from '@common/authorization/guards/permission.guard';
import { DataAccessInterceptor } from '@common/authorization/interceptors/data-access.interceptor';
import { BearerGuard } from '@common/guards';
import { IsMaintenanceGuard } from '@common/guards/is-maintenance.guard';
import { RequestWithInfo } from '@common/types/request-with-info';
import { PaginationDecorator, PaginationParams } from '@common/decorators/pagination.decorator';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BiPaymentDocumentService } from './bi-payment-document.service';
import { SearchBiPaymentDocumentDto, UploadBiPaymentDocumentDto } from './dto';
import { SortCamel, SortCamelParams } from '../common/decorators/sort-camel.decorator';

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
  // programId is required; StepScopeService (in the service) enforces per-program
  // + per-workstep access (SO owner = all worksteps; otherwise only worksteps
  // whose mapped code the user holds at this program). Visibility = step×program:
  // a user with a step code at this program sees every doc of that step — no
  // per-record data-scope (the doc table carries no data_access rules by design).
  @ApiOperation({ summary: 'List documents (filter by workstep)' })
  @Get()
  @RequirePermission(
    'bp_program_preparing',
    'bp_program_calculating',
    'bp_program_reconciliation_bicc',
    'bp_program_reconciliation_sale',
    'bp_program_confirm_release',
  )
  list(
    @Query() q: SearchBiPaymentDocumentDto,
    @SortCamel({
      allowedFields: ['id', 'createdAt', 'documentName', 'documentStatus'],
      default: { sortField: 'createdAt', sortValue: 'DESC' },
    })
    sortParams: SortCamelParams,
    @PaginationDecorator() pagination: PaginationParams,
    @Req() req: RequestWithInfo,
  ) {
    const userId = req.info?.user?.id as number | undefined;
    return this.service.list(q.programId, q, userId, sortParams, pagination);
  }

  // GET /bi-payment/document/:id — Strapi findOneDocumentById: doc + flags.
  @ApiOperation({ summary: 'Get document detail' })
  @Get(':id')
  @RequirePermission(
    'bp_program_preparing',
    'bp_program_calculating',
    'bp_program_reconciliation_bicc',
    'bp_program_reconciliation_sale',
    'bp_program_confirm_release',
  )
  details(@Param('id') id: number, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number | undefined;
    return this.service.findOne(+id, adminFlag(req), userId);
  }

  // GET /bi-payment/document/:id/download — Strapi dowloadFileDocument (metadata; stream deferred).
  @ApiOperation({ summary: 'Download document' })
  @Get(':id/download')
  @RequirePermission(
    'bp_program_preparing',
    'bp_program_calculating',
    'bp_program_reconciliation_bicc',
    'bp_program_reconciliation_sale',
    'bp_program_confirm_release',
  )
  download(@Param('id') id: number, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number | undefined;
    return this.service.download(+id, adminFlag(req), userId);
  }

  // POST /bi-payment/document — Strapi createDocument. workStep trong body (EworkstepType).
  @ApiOperation({ summary: 'Upload document' })
  @Post()
  @RequirePermission(
    'bp_program_preparing',
    'bp_program_calculating',
    'bp_program_reconciliation_bicc',
    'bp_program_reconciliation_sale',
    'bp_program_confirm_release',
  )
  upload(@Body() dto: UploadBiPaymentDocumentDto, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number | undefined;
    return this.service.upload(dto, req.info?.dataScope ?? null, userId ? +userId : undefined);
  }

  // DELETE /bi-payment/document/:id — soft delete (no Strapi parity; NestJS-only endpoint).
  @ApiOperation({ summary: 'Delete document (soft delete)' })
  @Delete(':id')
  @RequirePermission('bp_program_preparing', 'bp_program_reconciliation_bicc', 'bp_program_confirm_release')
  delete(@Param('id') id: number, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number | undefined;
    return this.service.delete(+id, adminFlag(req), userId);
  }

  // PATCH /bi-payment/document/update-status — Strapi updateStatusDocuments (batch).
  // Body { ids, status, rejectionReason } → { success, error, idsSuccess, idsError }.
  @ApiOperation({ summary: 'Update document status (batch)' })
  @Patch('update-status')
  @RequirePermission('bp_program_preparing', 'bp_program_reconciliation_bicc')
  updateStatus(@Body() dto: { ids: number[]; status: string; rejectionReason?: string }, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number | undefined;
    return this.service.updateStatus(dto, userId);
  }

  // POST /bi-payment/document/merge-file — Strapi mergeFile. Body { documentIds, mode, templateId }.
  @ApiOperation({ summary: 'Merge documents' })
  @Post('merge-file')
  @RequirePermission('bp_program_confirm_release')
  merge(
    @Body() dto: { documentIds: number[]; mode: 'csv' | 'excel'; templateId: number },
    @Req() req: RequestWithInfo,
  ) {
    const userId = req.info?.user?.id as number | undefined;
    return this.service.merge(dto, userId);
  }

  // GET /bi-payment/document/get-merged-status-reconcilation/:id — Strapi.
  @ApiOperation({ summary: 'Get merge status' })
  @Get('get-merged-status-reconcilation/:id')
  @RequirePermission('bp_program_confirm_release')
  getMergeStatus(@Param('id') id: number, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number | undefined;
    return this.service.getMergeStatus(+id, adminFlag(req), userId);
  }

  // GET /bi-payment/document/download-merged-reconcilation/:id — Strapi.
  @ApiOperation({ summary: 'Download merged file' })
  @Get('download-merged-reconcilation/:id')
  @RequirePermission('bp_program_confirm_release')
  downloadMerged(@Param('id') id: number, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number | undefined;
    return this.service.downloadMerged(+id, adminFlag(req), userId);
  }

  // Report endpoints (Strapi parity):
  // stats: full IFindDocument filters → { total, SUBMIT, APPROVAL, REJECTED }.
  @ApiOperation({ summary: 'Document stats by status' })
  @Get('stats')
  @RequirePermission('bp_program_view')
  stats(@Query() q: SearchBiPaymentDocumentDto, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number | undefined;
    return this.service.stats(q.programId ?? 0, q, userId);
  }

  // upload-status: query ids (csv) → [{ id, s3_upload_status }] for the visible subset.
  @ApiOperation({ summary: 'Document s3 upload-status by ids' })
  @Get('upload-status')
  @RequirePermission('bp_program_view')
  uploadStatus(@Query('ids') ids: string, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number | undefined;
    return this.service.uploadStatus(ids, userId);
  }

  // user-created/updated/approved/rejected — enumerate DISTINCT users (id+email) who
  // created/updated/approved/rejected bi-payment docs the caller may see. keyword filters email.
  @ApiOperation({ summary: 'Users who created documents' })
  @Get('user-created')
  @RequirePermission('bp_program_view')
  userCreated(
    @Query('keyword') keyword: string,
    @PaginationDecorator() pagination: PaginationParams,
    @Req() req: RequestWithInfo,
  ) {
    const userId = req.info?.user?.id as number | undefined;
    return this.service.listUserCreated(keyword, pagination, userId);
  }

  @ApiOperation({ summary: 'Users who updated documents' })
  @Get('user-updated')
  @RequirePermission('bp_program_view')
  userUpdated(
    @Query('keyword') keyword: string,
    @PaginationDecorator() pagination: PaginationParams,
    @Req() req: RequestWithInfo,
  ) {
    const userId = req.info?.user?.id as number | undefined;
    return this.service.listUserUpdated(keyword, pagination, userId);
  }

  @ApiOperation({ summary: 'Users who approved documents' })
  @Get('user-approved')
  @RequirePermission('bp_program_view')
  userApproved(
    @Query('keyword') keyword: string,
    @PaginationDecorator() pagination: PaginationParams,
    @Req() req: RequestWithInfo,
  ) {
    const userId = req.info?.user?.id as number | undefined;
    return this.service.listUserApproved(keyword, pagination, userId);
  }

  @ApiOperation({ summary: 'Users who rejected documents' })
  @Get('user-rejected')
  @RequirePermission('bp_program_view')
  userRejected(
    @Query('keyword') keyword: string,
    @PaginationDecorator() pagination: PaginationParams,
    @Req() req: RequestWithInfo,
  ) {
    const userId = req.info?.user?.id as number | undefined;
    return this.service.listUserRejected(keyword, pagination, userId);
  }
}

// Super-admin bypasses the step×program check (mirrors PermissionGuard verb-gate bypass).
function adminFlag(req: RequestWithInfo): { isAdmin: boolean } {
  return { isAdmin: req.info?.user?.type === 'super_admin' };
}
