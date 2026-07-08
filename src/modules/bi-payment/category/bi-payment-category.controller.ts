import { PaginationDecorator, PaginationParams } from '@common/decorators/pagination.decorator';
import { RequirePermission } from '@common/authorization/decorators/require-permission.decorator';
import { OwnerScopeGuard } from '@common/authorization/guards/owner-scope.guard';
import { PermissionGuard } from '@common/authorization/guards/permission.guard';
import { BearerGuard } from '@common/guards';
import { IsMaintenanceGuard } from '@common/guards/is-maintenance.guard';
import { SortCamel, SortCamelParams } from '../common/decorators/sort-camel.decorator';
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BiPaymentCategoryService } from './bi-payment-category.service';
import { CreateBiPaymentCategoryDto, SearchBiPaymentCategoryDto } from './dto';

// Strapi parity: /bi-payment/category. Whole-table config (no @RequireDataAccess).
// Perm: create/delete = bp_project_create|edit (OR); view = bp_project_view.
@Controller('bi-payment/category')
@ApiTags('bi-payment-category')
@ApiBearerAuth()
@UseGuards(BearerGuard, IsMaintenanceGuard, PermissionGuard, OwnerScopeGuard)
export class BiPaymentCategoryController {
  constructor(private readonly service: BiPaymentCategoryService) {}

  // GET /bi-payment/category — Strapi findCategory (admin + public gộp).
  @ApiOperation({ summary: 'List categories' })
  @Get()
  @RequirePermission('bp_project_view')
  search(
    @Query() query: SearchBiPaymentCategoryDto,
    @SortCamel({ allowedFields: ['id', 'name', 'createdAt'] }) sortParams: SortCamelParams,
    @PaginationDecorator() pagination: PaginationParams,
  ) {
    return this.service.search(query, sortParams, pagination);
  }

  // POST /bi-payment/category — Strapi createCategory.
  @ApiOperation({ summary: 'Create category' })
  @Post()
  @HttpCode(200)
  @RequirePermission('bp_project_create', 'bp_project_edit')
  create(@Body() dto: CreateBiPaymentCategoryDto) {
    return this.service.create(dto);
  }

  // DELETE /bi-payment/category/:id — Strapi deleteCategory.
  @ApiOperation({ summary: 'Delete category (soft delete)' })
  @Delete(':id')
  @RequirePermission('bp_project_create', 'bp_project_edit')
  delete(@Param('id') id: number) {
    return this.service.delete(+id);
  }

  // DELETE /bi-payment/category/delete-many?ids=1,2,3 — Strapi deleteManyCategory (query ids).
  @ApiOperation({ summary: 'Delete many categories' })
  @Delete('delete-many')
  @RequirePermission('bp_project_create', 'bp_project_edit')
  deleteMany(@Query('ids') ids: string) {
    return this.service.deleteMany(ids);
  }
}
