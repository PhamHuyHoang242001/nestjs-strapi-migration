import { RequirePermission } from '@common/authorization/decorators/require-permission.decorator';
import { OwnerScopeGuard } from '@common/authorization/guards/owner-scope.guard';
import { PermissionGuard } from '@common/authorization/guards/permission.guard';
import { DataAccessInterceptor } from '@common/authorization/interceptors/data-access.interceptor';
import { BearerGuard } from '@common/guards';
import { IsMaintenanceGuard } from '@common/guards/is-maintenance.guard';
import { RequestWithInfo } from '@common/types/request-with-info';
import { PaginationDecorator, PaginationParams } from '@common/decorators/pagination.decorator';
import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BiPaymentDocumentService } from './bi-payment-document.service';
import { SearchBiPaymentDocumentDto, UploadBiPaymentDocumentDto } from './dto';
import { SortCamel, SortCamelParams } from '../common/decorators/sort-camel.decorator';

// bp_program_content_view: read-only full-content grant — mở list/stats/details/
// download cho toàn bộ document của program (mọi step), không cần upload.
const DOCUMENT_READ_PERMS = [
  'bp_program_view',
  'bp_program_upload',
  'bp_program_upload_recon',
  'bp_program_content_view',
];
const DOCUMENT_UPLOAD_PERMS = ['bp_program_upload', 'bp_program_upload_recon'];
const DOCUMENT_STATUS_PERMS = ['bp_program_upload', 'bp_program_upload_recon', 'bp_program_approve'];

// Strapi parity: /bi-payment/document (flat), programId via @Query.
// Guard order LOCKED. Service resolves per-program workstep scope and own-only
// recon visibility after this coarse OR-gate.
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
  @RequirePermission(...DOCUMENT_READ_PERMS)
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

  // POST /bi-payment/document — Strapi createDocument. workStep trong body (EworkstepType).
  @ApiOperation({ summary: 'Upload document' })
  @Post()
  @RequirePermission(...DOCUMENT_UPLOAD_PERMS)
  upload(@Body() dto: UploadBiPaymentDocumentDto, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number | undefined;
    return this.service.upload(dto, req.info?.dataScope ?? null, userId ? +userId : undefined);
  }

  // PATCH /bi-payment/document/update-status — Strapi updateStatusDocuments (batch).
  // Body { ids, status, rejectionReason } → { success, error, idsSuccess, idsError }.
  @ApiOperation({ summary: 'Update document status (batch)' })
  @Patch('update-status')
  @RequirePermission(...DOCUMENT_STATUS_PERMS)
  updateStatus(@Body() dto: { ids: number[]; status: string; rejectionReason?: string }, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number | undefined;
    return this.service.updateStatus(dto, userId, adminFlag(req));
  }

  // POST /bi-payment/document/merge-file — Strapi mergeFile. Body { documentIds, mode, templateId }.
  @ApiOperation({ summary: 'Merge documents' })
  @Post('merge-file')
  @RequirePermission('bp_program_upload')
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
  @RequirePermission('bp_program_upload')
  getMergeStatus(@Param('id') id: number, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number | undefined;
    return this.service.getMergeStatus(+id, adminFlag(req), userId);
  }

  // GET /bi-payment/document/download-merged-reconcilation/:id — Strapi.
  @ApiOperation({ summary: 'Download merged file' })
  @Get('download-merged-reconcilation/:id')
  @RequirePermission('bp_program_upload')
  downloadMerged(@Param('id') id: number, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number | undefined;
    return this.service.downloadMerged(+id, adminFlag(req), userId);
  }

  // Report endpoints (Strapi parity):
  // stats: full IFindDocument filters → { total, SUBMIT, APPROVAL, REJECTED }.
  @ApiOperation({ summary: 'Document stats by status' })
  @Get('stats')
  @RequirePermission(...DOCUMENT_READ_PERMS)
  stats(@Query() q: SearchBiPaymentDocumentDto, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number | undefined;
    return this.service.stats(q.programId ?? 0, q, userId);
  }

  // upload-status: query ids (csv) → [{ id, s3_upload_status }] for the visible subset.
  @ApiOperation({ summary: 'Document s3 upload-status by ids' })
  @Get('upload-status')
  @RequirePermission(...DOCUMENT_READ_PERMS)
  uploadStatus(@Query('ids') ids: string, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number | undefined;
    return this.service.uploadStatus(ids, userId);
  }

  // user-created/updated/approved/rejected — enumerate DISTINCT users (id+email) who
  // created/updated/approved/rejected bi-payment docs the caller may see. keyword filters email.
  @ApiOperation({ summary: 'Users who created documents' })
  @Get('user-created')
  @RequirePermission(...DOCUMENT_READ_PERMS)
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
  @RequirePermission(...DOCUMENT_READ_PERMS)
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
  @RequirePermission(...DOCUMENT_READ_PERMS)
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
  @RequirePermission(...DOCUMENT_READ_PERMS)
  userRejected(
    @Query('keyword') keyword: string,
    @PaginationDecorator() pagination: PaginationParams,
    @Req() req: RequestWithInfo,
  ) {
    const userId = req.info?.user?.id as number | undefined;
    return this.service.listUserRejected(keyword, pagination, userId);
  }

  // Dynamic GET routes stay after one-segment static routes so paths such as
  // /stats and /user-created are never captured as an `id` by Express.
  @ApiOperation({ summary: 'Get document detail' })
  @Get(':id')
  @RequirePermission(...DOCUMENT_READ_PERMS)
  details(@Param('id') id: number, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number | undefined;
    return this.service.findOne(+id, adminFlag(req), userId);
  }

  @ApiOperation({ summary: 'Download document' })
  @Get(':id/download')
  @RequirePermission(...DOCUMENT_READ_PERMS)
  download(@Param('id') id: number, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number | undefined;
    return this.service.download(+id, adminFlag(req), userId);
  }
}

// Super-admin bypasses the step×program check (mirrors PermissionGuard verb-gate bypass).
function adminFlag(req: RequestWithInfo): { isAdmin: boolean } {
  return { isAdmin: req.info?.user?.type === 'super_admin' };
}
