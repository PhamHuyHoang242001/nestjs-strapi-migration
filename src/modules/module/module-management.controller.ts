import { PaginationDecorator, PaginationParams } from '@common/decorators/pagination.decorator';
import { Sort, SortParams } from '@common/decorators/sort.decorator';
import { BearerGuard, IsMaintenanceGuard } from '@common/guards';
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateModuleDto } from './dto/create-module.dto';
import { ListModuleDto } from './dto/list-module.dto';
import { UpdateModuleDto } from './dto/update-module.dto';
import { ModuleManagementService } from './module-management.service';

@Controller('v1/module')
@ApiTags('module')
@ApiBearerAuth()
export class ModuleManagementController {
  constructor(private readonly moduleManagementService: ModuleManagementService) {}

  @ApiOperation({ summary: 'Get module tree' })
  @Get('tree')
  @UseGuards(BearerGuard, IsMaintenanceGuard)
  getTree() {
    return this.moduleManagementService.getTree();
  }

  @ApiOperation({ summary: 'Get all active modules' })
  @Get('all')
  @UseGuards(BearerGuard, IsMaintenanceGuard)
  getAll() {
    return this.moduleManagementService.getAll();
  }

  @ApiOperation({ summary: 'Search modules with pagination' })
  @Get('search')
  @UseGuards(BearerGuard, IsMaintenanceGuard)
  search(
    @PaginationDecorator() paginationParams: PaginationParams,
    @Sort({ allowedFields: ['created_at', 'name', 'path'] }) sortParams: SortParams,
    @Query() query: ListModuleDto,
  ) {
    return this.moduleManagementService.search(query, sortParams, paginationParams);
  }

  @ApiOperation({ summary: 'Get module details' })
  @Get('details')
  @UseGuards(BearerGuard, IsMaintenanceGuard)
  details(@Query('id') id: number) {
    return this.moduleManagementService.details(id);
  }

  @ApiOperation({ summary: 'Create module' })
  @ApiBody({ type: CreateModuleDto })
  @Post('create')
  @HttpCode(200)
  @UseGuards(BearerGuard, IsMaintenanceGuard)
  create(@Body() body: CreateModuleDto) {
    return this.moduleManagementService.create(body);
  }

  @ApiOperation({ summary: 'Update module' })
  @ApiBody({ type: UpdateModuleDto })
  @Put('update/:id')
  @UseGuards(BearerGuard, IsMaintenanceGuard)
  update(@Param('id') id: number, @Body() body: UpdateModuleDto) {
    return this.moduleManagementService.update(id, body);
  }

  @ApiOperation({ summary: 'Delete module' })
  @Delete('delete/:id')
  @UseGuards(BearerGuard, IsMaintenanceGuard)
  delete(@Param('id') id: number) {
    return this.moduleManagementService.delete(id);
  }
}
