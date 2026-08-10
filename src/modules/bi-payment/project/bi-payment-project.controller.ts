import { PaginationDecorator, PaginationParams } from '@common/decorators/pagination.decorator';
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
import { UserType } from '@modules/databases/user.entity';
import { SortCamel, SortCamelParams } from '../common/decorators/sort-camel.decorator';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BiPaymentProjectService } from './bi-payment-project.service';
import { CreateBiPaymentProjectDto, SearchBiPaymentProjectDto, UpdateBiPaymentProjectDto } from './dto';

// Strapi parity: /bi-payment/project (admin + public gộp, phân quyền bằng @RequirePermission).
// Guard order LOCKED: JwtAuthGuard → PermissionGuard → OwnerScopeGuard → DataAccessInterceptor.
@Controller('bi-payment/project')
@ApiTags('bi-payment-project')
@ApiBearerAuth()
@UseGuards(BearerGuard, IsMaintenanceGuard, PermissionGuard, OwnerScopeGuard)
@UseInterceptors(DataAccessInterceptor)
export class BiPaymentProjectController {
  constructor(private readonly service: BiPaymentProjectService) {}

  // GET /bi-payment/project — Strapi findProject (admin+public gộp).
  @ApiOperation({ summary: 'List BI Payment projects' })
  @Get()
  @RequirePermission('bp_project_view')
  @RequireDataAccess(DATA_ACCESS_TABLE.BI_PAYMENT_PROJECTS, 'bp_project_view')
  search(
    @Query() query: SearchBiPaymentProjectDto,
    @SortCamel({ allowedFields: ['createdAt', 'projectName', 'projectCode'] }) sortParams: SortCamelParams,
    @PaginationDecorator() pagination: PaginationParams,
    @Req() req: RequestWithInfo,
  ) {
    return this.service.search(query, sortParams, pagination, req.info?.dataScope ?? null);
  }

  // Static GET routes MUST precede the ':id' param route below, or Nest matches
  // /user-created and /user-updated against ':id' (id="user-created" → NaN).
  // GET /bi-payment/project/user-created — Strapi userCreatedProject.
  @ApiOperation({ summary: 'Projects created by current user' })
  @Get('user-created')
  @RequirePermission('bp_project_view')
  @RequireDataAccess(DATA_ACCESS_TABLE.BI_PAYMENT_PROJECTS, 'bp_project_view')
  userCreated(@Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number | undefined;
    return this.service.listUserCreated(userId ? +userId : 0, req.info?.dataScope ?? null);
  }

  // GET /bi-payment/project/user-updated — Strapi userUpdatedProject.
  @ApiOperation({ summary: 'Projects updated by current user' })
  @Get('user-updated')
  @RequirePermission('bp_project_view')
  @RequireDataAccess(DATA_ACCESS_TABLE.BI_PAYMENT_PROJECTS, 'bp_project_view')
  userUpdated(@Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number | undefined;
    return this.service.listUserUpdated(userId ? +userId : 0, req.info?.dataScope ?? null);
  }

  // GET /bi-payment/project/:id — Strapi findProjectById.
  @ApiOperation({ summary: 'Get BI Payment project details' })
  @Get(':id')
  @RequirePermission('bp_project_view')
  @RequireDataAccess(DATA_ACCESS_TABLE.BI_PAYMENT_PROJECTS, 'bp_project_view')
  details(@Param('id') id: number, @Req() req: RequestWithInfo) {
    return this.service.details(+id, req.info?.dataScope ?? null);
  }

  // POST /bi-payment/project — Strapi createProject.
  // Parent-scope enforced in service.create() (canCreateUnderParent): no record exists yet,
  // so the check is on the parent bicc_department, not via @RequireOwnerScope.
  @ApiOperation({ summary: 'Create BI Payment project' })
  @Post()
  @HttpCode(200)
  @RequirePermission('bp_project_create')
  create(@Body() body: CreateBiPaymentProjectDto, @Req() req: RequestWithInfo) {
    const userId = Number(req.info?.user?.id);
    const isSuperAdmin = req.info?.user?.type === UserType.SUPER_ADMIN;
    return this.service.create(body, userId, isSuperAdmin);
  }

  // PATCH /bi-payment/project/:id — Strapi updateProject (PATCH, không PUT).
  @ApiOperation({ summary: 'Update BI Payment project' })
  @Patch(':id')
  @RequirePermission('bp_project_edit')
  @RequireOwnerScope({ table: 'bi_payment_projects', scopeFromParam: 'id' })
  update(@Param('id') id: number, @Body() body: UpdateBiPaymentProjectDto) {
    return this.service.update(+id, body);
  }

  // DELETE /bi-payment/project — Strapi deleteManyProject (body ids).
  // Multi-id body has no single record param for OwnerScopeGuard; data-access interceptor builds
  // the scope predicate and service.deleteMany filters ids against it (defense-in-depth).
  @ApiOperation({ summary: 'Delete many projects' })
  @Delete()
  @RequirePermission('bp_project_delete')
  @RequireDataAccess(DATA_ACCESS_TABLE.BI_PAYMENT_PROJECTS, 'bp_project_delete')
  deleteMany(@Body() body: { ids: number[] }, @Req() req: RequestWithInfo) {
    return this.service.deleteMany(body.ids ?? [], req.info?.dataScope ?? null);
  }

  // DELETE /bi-payment/project/:id — Strapi deleteProject.
  @ApiOperation({ summary: 'Delete BI Payment project (soft delete)' })
  @Delete(':id')
  @RequirePermission('bp_project_delete')
  @RequireOwnerScope({ table: 'bi_payment_projects', scopeFromParam: 'id' })
  delete(@Param('id') id: number) {
    return this.service.delete(+id);
  }

}
