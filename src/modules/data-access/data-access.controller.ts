import { RequirePermission } from '@common/authorization/decorators/require-permission.decorator';
import { PermissionGuard } from '@common/authorization/guards/permission.guard';
import { PaginationDecorator, PaginationParams } from '@common/decorators/pagination.decorator';
import { Sort, SortParams } from '@common/decorators/sort.decorator';
import { BearerGuard } from '@common/guards';
import { IsMaintenanceGuard } from '@common/guards/is-maintenance.guard';
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequestWithInfo } from '@common/types/request-with-info';
import { DataAccessService } from './data-access.service';
import { CreateBulkDataAccessDto } from './dto/create-bulk-data-access.dto';
import { CreateDataAccessDto } from './dto/create-data-access.dto';
import { HandoverDataAccessDto } from './dto/handover-data-access.dto';
import { RemoveLinkDataAccessDto } from './dto/remove-link-data-access.dto';
import { SearchDataAccessDto } from './dto/search-data-access.dto';
import { UpdateDataAccessDto } from './dto/update-data-access.dto';

@Controller('v1/data-access')
@ApiTags('data-access')
@ApiBearerAuth()
@UseGuards(BearerGuard, IsMaintenanceGuard, PermissionGuard)
export class DataAccessController {
  constructor(private readonly dataAccessService: DataAccessService) {}

  @ApiOperation({ summary: 'List data access rules grouped by record (data_id + module_id) with pagination' })
  @Get('list')
  @RequirePermission('perm_data_access_view')
  list(
    @Query() query: SearchDataAccessDto,
    @Sort({ allowedFields: ['created_at'] }) sortParams: SortParams,
    @PaginationDecorator() pagination: PaginationParams,
    @Req() req: RequestWithInfo,
  ) {
    return this.dataAccessService.list(query, sortParams, pagination, req.info?.user, req.info?.client);
  }

  @ApiOperation({ summary: 'Get data access rule details with relations' })
  @Get('details/:id')
  @RequirePermission('perm_data_access_view')
  details(@Param('id') id: number) {
    return this.dataAccessService.details(id);
  }

  @ApiOperation({ summary: 'Create data access rules (supports multiple data_ids)' })
  @Post('create')
  @HttpCode(200)
  @RequirePermission('perm_data_access_create')
  create(@Body() body: CreateDataAccessDto, @Req() req: RequestWithInfo) {
    const user = req.info?.user;
    return this.dataAccessService.create(body, (user?.username as string) || 'system', user, req.info?.client);
  }

  @ApiOperation({ summary: 'Create data access rules in bulk' })
  @Post('create-bulk')
  @HttpCode(200)
  @RequirePermission('perm_data_access_create')
  createBulk(@Body() body: CreateBulkDataAccessDto, @Req() req: RequestWithInfo) {
    const user = req.info?.user;
    return this.dataAccessService.create(body, (user?.username as string) || 'system', user, req.info?.client);
  }

  @ApiOperation({ summary: 'Update a data access rule (soft-delete + insert for audit trail)' })
  @Put('update/:id')
  @RequirePermission('perm_data_access_create')
  update(@Param('id') id: number, @Body() body: UpdateDataAccessDto, @Req() req: RequestWithInfo) {
    const user = req.info?.user;
    return this.dataAccessService.update(id, body, (user?.username as string) || 'system', user, req.info?.client);
  }

  @ApiOperation({ summary: 'Soft-delete a data access rule' })
  @Delete('delete/:id')
  @RequirePermission('perm_data_access_delete')
  delete(@Param('id') id: number, @Req() req: RequestWithInfo) {
    const user = req.info?.user;
    return this.dataAccessService.delete(id, (user?.username as string) || 'system', user, req.info?.client);
  }

  @ApiOperation({ summary: 'Remove a specific subject (role/user) link from a rule' })
  @Delete('remove-link/:ruleId')
  @RequirePermission('perm_data_access_delete')
  removeLink(@Param('ruleId') ruleId: number, @Query() query: RemoveLinkDataAccessDto, @Req() req: RequestWithInfo) {
    const user = req.info?.user;
    return this.dataAccessService.removeLink(
      ruleId,
      query.subject_type,
      query.subject_id,
      (user?.username as string) || 'system',
      user,
      req.info?.client,
    );
  }

  @ApiOperation({ summary: 'Hand over a report edit grant from one user to another (atomic)' })
  @Post('handover')
  @HttpCode(200)
  @RequirePermission('perm_data_access_create')
  handover(@Body() body: HandoverDataAccessDto, @Req() req: RequestWithInfo) {
    const user = req.info?.user;
    return this.dataAccessService.handover(body, (user?.username as string) || 'system', user, req.info?.client);
  }

  @ApiOperation({ summary: 'Get all data access rules for a specific user' })
  @Get('by-user/:userId')
  @RequirePermission('perm_data_access_view')
  getByUser(@Param('userId') userId: number) {
    return this.dataAccessService.getByUser(userId);
  }

  @ApiOperation({ summary: 'Get all data access rules for a specific role' })
  @Get('by-role/:roleId')
  @RequirePermission('perm_data_access_view')
  getByRole(@Param('roleId') roleId: number) {
    return this.dataAccessService.getByRole(roleId);
  }
}
