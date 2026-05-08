import { PaginationDecorator, PaginationParams } from '@common/decorators/pagination.decorator';
import { Sort, SortParams } from '@common/decorators/sort.decorator';
import { RequireDataAccess } from '@common/authorization/decorators/require-data-access.decorator';
import { RequirePermission } from '@common/authorization/decorators/require-permission.decorator';
import { PermissionGuard } from '@common/authorization/guards/permission.guard';
import { DataAccessInterceptor } from '@common/authorization/interceptors/data-access.interceptor';
import { DATA_ACCESS_TABLE } from '@common/enums';
import { BearerGuard } from '@common/guards';
import { IsMaintenanceGuard } from '@common/guards/is-maintenance.guard';
import { RequestWithInfo } from '@common/types/request-with-info';
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BiccDepartmentService } from './bicc-department.service';
import { CreateBiccDepartmentDto, SearchBiccDepartmentDto, UpdateBiccDepartmentDto } from './dto';

@Controller('v1/bicc-department')
@ApiTags('bicc-department')
@ApiBearerAuth()
@UseGuards(BearerGuard, IsMaintenanceGuard, PermissionGuard)
@UseInterceptors(DataAccessInterceptor)
export class BiccDepartmentController {
  constructor(private readonly biccDepartmentService: BiccDepartmentService) {}

  @ApiOperation({ summary: 'List BICC departments with pagination and data-access filtering' })
  @Get('search')
  @RequirePermission('bh_bicc_dept_view')
  @RequireDataAccess(DATA_ACCESS_TABLE.BI_HUB_BICC_DEPARTMENTS, 'bh_bicc_dept_view')
  search(
    @Query() query: SearchBiccDepartmentDto,
    @Sort({ allowedFields: ['created_at', 'name', 'code'] }) sortParams: SortParams,
    @PaginationDecorator() pagination: PaginationParams,
    @Req() req: RequestWithInfo,
  ) {
    return this.biccDepartmentService.search(query, sortParams, pagination, req.info?.accessibleDataIds);
  }

  @ApiOperation({ summary: 'Get BICC department details' })
  @Get('details/:id')
  @RequirePermission('bh_bicc_dept_view')
  details(@Param('id') id: number) {
    return this.biccDepartmentService.details(id);
  }

  @ApiOperation({ summary: 'Create BICC department' })
  @Post('create')
  @HttpCode(200)
  @RequirePermission('bh_bicc_dept_create')
  create(@Body() body: CreateBiccDepartmentDto) {
    return this.biccDepartmentService.create(body);
  }

  @ApiOperation({ summary: 'Update BICC department' })
  @Put('update/:id')
  @RequirePermission('bh_bicc_dept_edit')
  update(@Param('id') id: number, @Body() body: UpdateBiccDepartmentDto) {
    return this.biccDepartmentService.update(id, body);
  }

  @ApiOperation({ summary: 'Delete BICC department (soft delete)' })
  @Delete('delete/:id')
  @RequirePermission('bh_bicc_dept_delete')
  delete(@Param('id') id: number) {
    return this.biccDepartmentService.delete(id);
  }
}
