import { HeaderScope } from '@common/decorators';
import { PaginationDecorator, PaginationParams } from '@common/decorators/pagination.decorator';
import { Sort, SortParams } from '@common/decorators/sort.decorator';
import { BearerGuard, IsMaintenanceGuard } from '@common/guards';
import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { Put, Query } from '@nestjs/common/decorators';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ListPermissionDto } from './dto';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { PermissionService } from './permission.service';

@Controller('v1/permission')
@ApiTags('permission')
@ApiBearerAuth()
export class PermissionController {
  constructor(private readonly permissionService: PermissionService) {}

  @ApiOperation({
    description: 'Search categories by search input',
  })
  @Get('search')
  @UseGuards(BearerGuard, IsMaintenanceGuard)
  async search(
    @PaginationDecorator() paginationParams: PaginationParams,
    @Sort({ allowedFields: ['created_at', 'name'] }) sortParams: SortParams,
    @Query() query: ListPermissionDto,
  ) {
    return this.permissionService.search(query, sortParams, paginationParams);
  }

  @ApiOperation({ summary: 'create' })
  @ApiBody({
    description: 'create',
    type: CreatePermissionDto,
  })
  @Post('create')
  @HttpCode(200)
  @UseGuards(BearerGuard, IsMaintenanceGuard)
  async create(@Body() body: CreatePermissionDto) {
    await this.permissionService.validateForm(body);
    return this.permissionService.create(body);
  }

  @ApiOperation({
    description: 'details',
  })
  @Get('details')
  @UseGuards(BearerGuard, IsMaintenanceGuard)
  details(@Query('id') id: number) {
    return this.permissionService.details(id);
  }

  @ApiOperation({
    description: 'update',
  })
  @ApiBody({
    type: UpdatePermissionDto,
  })
  @Put('update/:id')
  @UseGuards(BearerGuard, IsMaintenanceGuard)
  async update(@Param('id') id: number, @Body() body: UpdatePermissionDto) {
    await this.permissionService.validateFormUpdate(body, id);
    return this.permissionService.update(id, body);
  }

  @Delete('delete/:id')
  @UseGuards(BearerGuard, IsMaintenanceGuard)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  delete(@Param('id') id: number, @HeaderScope() _header: unknown) {
    return this.permissionService.delete(id);
  }

  @Get('all')
  @UseGuards(BearerGuard, IsMaintenanceGuard)
  getAll() {
    return this.permissionService.getAll();
  }
}
