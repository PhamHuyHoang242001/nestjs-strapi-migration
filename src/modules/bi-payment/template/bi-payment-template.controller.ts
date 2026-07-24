import { RequirePermission } from '@common/authorization/decorators/require-permission.decorator';
import { OwnerScopeGuard } from '@common/authorization/guards/owner-scope.guard';
import { PermissionGuard } from '@common/authorization/guards/permission.guard';
import { DataAccessInterceptor } from '@common/authorization/interceptors/data-access.interceptor';
import { BearerGuard } from '@common/guards';
import { IsMaintenanceGuard } from '@common/guards/is-maintenance.guard';
import { RequestWithInfo } from '@common/types/request-with-info';
import { PaginationDecorator, PaginationParams } from '@common/decorators/pagination.decorator';
import { UserType } from '@modules/databases/user.entity';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BiPaymentTemplateService } from './bi-payment-template.service';
import { CreateBiPaymentTemplateDto, DuplicateManyTemplateDto, SearchBiPaymentTemplateDto } from './dto';
import { SortCamel, SortCamelParams } from '../common/decorators/sort-camel.decorator';

// Template view ăn theo step×program: uploader (full) hoặc recon-uploader mới
// thấy template của step tương ứng trong program. Template không own-filter —
// recon-uploader thấy toàn bộ template tra soát (own-only chỉ áp cho document).
// bp_template_create cũng mở list (search) + content (details/download): người
// tạo template ở program phải thấy hết template của program đó để chọn template
// cần duplicate (data-scope ở service). Cross-program endpoints (user-created/
// updated) KHÔNG nhận code này — tạo template ở 1 program không lý do để liệt
// kê user mọi program.
const TEMPLATE_LIST_PERMS = ['bp_program_view', 'bp_program_upload', 'bp_program_upload_recon'];
const TEMPLATE_SEARCH_PERMS = [...TEMPLATE_LIST_PERMS, 'bp_template_create'];
// Content perms cho details/download: ai có upload/upload_recon (content-view)
// HOẶC create-code (luồng duplicate cần xem template nguồn).
const TEMPLATE_CONTENT_PERMS = ['bp_program_upload', 'bp_program_upload_recon', 'bp_template_create'];

@Controller('bi-payment/template')
@ApiTags('bi-payment-template')
@ApiBearerAuth()
@UseGuards(BearerGuard, IsMaintenanceGuard, PermissionGuard, OwnerScopeGuard)
@UseInterceptors(DataAccessInterceptor)
export class BiPaymentTemplateController {
  constructor(private readonly service: BiPaymentTemplateService) {}

  // GET /bi-payment/template — Strapi findTemplateV2. IFindTemplate filters +
  // sort + pagination → {data, meta}. programId required (step×program scope).
  @ApiOperation({ summary: 'List BI Payment templates' })
  @Get()
  @RequirePermission(...TEMPLATE_SEARCH_PERMS)
  search(
    @Query() dto: SearchBiPaymentTemplateDto,
    @SortCamel({
      allowedFields: ['id', 'createdAt', 'updatedAt'],
      default: { sortField: 'createdAt', sortValue: 'DESC' },
    })
    sortParams: SortCamelParams,
    @PaginationDecorator() pagination: PaginationParams,
    @Req() req: RequestWithInfo,
  ) {
    const userId = req.info?.user?.id as number | undefined;
    return this.service.search(userId ? +userId : undefined, dto, sortParams, pagination);
  }

  // POST /bi-payment/template — Strapi createTemplate. sheets cascade TODO.
  @ApiOperation({ summary: 'Create BI Payment template' })
  @Post()
  @HttpCode(200)
  @RequirePermission('bp_template_create')
  create(@Body() dto: CreateBiPaymentTemplateDto, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number | undefined;
    return this.service.create(dto, userId ? +userId : undefined);
  }

  // POST /bi-payment/template/duplicate-many — Strapi duplicateManyTemplate.
  // Body { fromProgramId, fromProjectId, toProgramId, listTemplate:[{id,name}] }.
  @ApiOperation({ summary: 'Duplicate many templates' })
  @Post('duplicate-many')
  @HttpCode(200)
  @RequirePermission('bp_template_create')
  duplicateMany(@Body() dto: DuplicateManyTemplateDto, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number | undefined;
    return this.service.duplicateMany(dto, userId ? +userId : undefined);
  }

  // DELETE /bi-payment/template/delete-many?ids=1,2,3 — Strapi deleteManyTemplate (query ids).
  @ApiOperation({ summary: 'Delete many templates' })
  @Delete('delete-many')
  @RequirePermission('bp_template_delete')
  deleteMany(@Query('ids') ids: string, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number | undefined;
    return this.service.deleteMany(ids, userId ? +userId : undefined, adminFlag(req));
  }

  // GET /bi-payment/template/user-created — Strapi findUserCreatedTemplate → distinct USERS.
  @ApiOperation({ summary: 'Users who created templates' })
  @Get('user-created')
  @RequirePermission(...TEMPLATE_LIST_PERMS)
  userCreated(
    @Query('keyword') keyword: string,
    @PaginationDecorator() pagination: PaginationParams,
    @Req() req: RequestWithInfo,
  ) {
    const userId = req.info?.user?.id as number | undefined;
    return this.service.listUserCreated(keyword, pagination, userId ? +userId : 0, adminFlag(req));
  }

  // GET /bi-payment/template/user-updated — Strapi findUserUpdatedTemplate → distinct USERS.
  @ApiOperation({ summary: 'Users who updated templates' })
  @Get('user-updated')
  @RequirePermission(...TEMPLATE_LIST_PERMS)
  userUpdated(
    @Query('keyword') keyword: string,
    @PaginationDecorator() pagination: PaginationParams,
    @Req() req: RequestWithInfo,
  ) {
    const userId = req.info?.user?.id as number | undefined;
    return this.service.listUserUpdated(keyword, pagination, userId ? +userId : 0, adminFlag(req));
  }

  // Dynamic routes stay after same-method static routes so Express never treats
  // `user-created`, `user-updated`, or `delete-many` as a template id.
  @ApiOperation({ summary: 'Get BI Payment template details' })
  @Get(':id')
  @RequirePermission(...TEMPLATE_CONTENT_PERMS)
  details(@Param('id') id: number, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number | undefined;
    return this.service.details(+id, userId ? +userId : undefined, adminFlag(req));
  }

  @ApiOperation({ summary: 'Download template metadata (view theo step)' })
  @Get(':id/download')
  @RequirePermission(...TEMPLATE_CONTENT_PERMS)
  download(@Param('id') id: number, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number | undefined;
    return this.service.download(+id, userId ? +userId : undefined, adminFlag(req));
  }

  @ApiOperation({ summary: 'Delete BI Payment template (soft delete)' })
  @Delete(':id')
  @RequirePermission('bp_template_delete')
  delete(@Param('id') id: number, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number | undefined;
    return this.service.delete(+id, userId ? +userId : undefined, adminFlag(req));
  }
}

// Super-admin bypasses the step×program check (mirrors PermissionGuard verb-gate bypass).
function adminFlag(req: RequestWithInfo): { isAdmin: boolean } {
  return { isAdmin: (req.info?.user?.type as UserType | undefined) === UserType.SUPER_ADMIN };
}
