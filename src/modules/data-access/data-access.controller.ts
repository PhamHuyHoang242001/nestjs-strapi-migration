import { PaginationDecorator, PaginationParams } from '@common/decorators/pagination.decorator';
import { Sort, SortParams } from '@common/decorators/sort.decorator';
import { BearerGuard } from '@common/guards';
import { IsMaintenanceGuard } from '@common/guards/is-maintenance.guard';
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DataAccessService } from './data-access.service';
import { CreateDataAccessDto } from './dto/create-data-access.dto';
import { SearchDataAccessDto } from './dto/search-data-access.dto';
import { UpdateDataAccessDto } from './dto/update-data-access.dto';

@Controller('v1/data-access')
@ApiTags('data-access')
@ApiBearerAuth()
@UseGuards(BearerGuard, IsMaintenanceGuard)
export class DataAccessController {
  constructor(private readonly dataAccessService: DataAccessService) {}

  @ApiOperation({ summary: 'Search data access rules (supports role/user/subject_type filters)' })
  @Get('search')
  search(
    @Query() query: SearchDataAccessDto,
    @Sort({ allowedFields: ['created_at', 'data_id', 'table_name', 'scope_type'] }) sortParams: SortParams,
    @PaginationDecorator() pagination: PaginationParams,
  ) {
    return this.dataAccessService.search(query, sortParams, pagination);
  }

  @ApiOperation({ summary: 'Get data access rule details with relations' })
  @Get('details/:id')
  details(@Param('id') id: number) {
    return this.dataAccessService.details(id);
  }

  @ApiOperation({ summary: 'Create a new data access rule (must set role_id or user_id)' })
  @Post('create')
  @HttpCode(200)
  create(@Body() body: CreateDataAccessDto) {
    return this.dataAccessService.create(body);
  }

  @ApiOperation({ summary: 'Update a data access rule (soft-delete + insert for audit trail)' })
  @Put('update/:id')
  update(@Param('id') id: number, @Body() body: UpdateDataAccessDto) {
    return this.dataAccessService.update(id, body);
  }

  @ApiOperation({ summary: 'Soft-delete a data access rule' })
  @Delete('delete/:id')
  delete(@Param('id') id: number) {
    return this.dataAccessService.delete(id);
  }

  @ApiOperation({ summary: 'Get all data access rules for a specific user' })
  @Get('by-user/:userId')
  getByUser(@Param('userId') userId: number) {
    return this.dataAccessService.getByUser(userId);
  }

  @ApiOperation({ summary: 'Get all data access rules for a specific role' })
  @Get('by-role/:roleId')
  getByRole(@Param('roleId') roleId: number) {
    return this.dataAccessService.getByRole(roleId);
  }
}
