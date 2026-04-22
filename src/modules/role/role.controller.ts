import { UserScope } from '@common/decorators';
import { PaginationDecorator, PaginationParams } from '@common/decorators/pagination.decorator';
import { Sort, SortParams } from '@common/decorators/sort.decorator';
import { StatusDto } from '@common/dto';
import { BearerGuard, IsMaintenanceGuard } from '@common/guards';
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Put, Query } from '@nestjs/common/decorators';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ListRoleDto } from './dto';
import { AssignUsersRoleDto } from './dto/assign-users-role.dto';
import { CloneRoleDto } from './dto/clone-role.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RoleService } from './role.service';
import { Users } from '@modules/databases/user.entity';

@Controller('v1/role')
@ApiTags('role')
@ApiBearerAuth()
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @ApiOperation({ summary: 'create' })
  @ApiBody({
    description: 'create',
    type: CreateRoleDto,
  })
  @Post('create')
  @HttpCode(200)
  @UseGuards(BearerGuard, IsMaintenanceGuard)
  async create(@Body() body: CreateRoleDto, @UserScope() user: Users) {
    const data = await this.roleService.validateForm(body);
    return this.roleService.create(data, user.id);
  }

  @ApiOperation({
    description: 'Search categories by search input',
  })
  @Get('search')
  @UseGuards(BearerGuard, IsMaintenanceGuard)
  async search(
    @PaginationDecorator() paginationParams: PaginationParams,
    @Sort({ allowedFields: ['created_at', 'name'] }) sortParams: SortParams,
    @Query() query: ListRoleDto,
  ) {
    return this.roleService.search(query, sortParams, paginationParams);
  }

  @ApiOperation({
    description: 'details',
  })
  @Get('details')
  @UseGuards(BearerGuard, IsMaintenanceGuard)
  details(@Query('id') id: number) {
    return this.roleService.details(id);
  }

  @ApiOperation({
    description: 'update',
  })
  @ApiBody({
    type: UpdateRoleDto,
  })
  @Put('update/:id')
  @UseGuards(BearerGuard, IsMaintenanceGuard)
  async update(@Param('id') id: number, @Body() body: UpdateRoleDto) {
    const data = await this.roleService.validateFormUpdate(body, id);
    return this.roleService.update(id, data);
  }
  @ApiOperation({
    description: 'set-status',
  })
  @ApiBody({
    type: UpdateRoleDto,
  })
  @Patch('set-status/:id')
  @UseGuards(BearerGuard, IsMaintenanceGuard)
  setStatus(@Param('id') id: number, @Body() body: StatusDto) {
    return this.roleService.setStatus(id, body);
  }

  @Delete('delete/:id')
  @UseGuards(BearerGuard, IsMaintenanceGuard)
  delete(@Param('id') id: number) {
    return this.roleService.delete(id);
  }

  @Get('all')
  @UseGuards(BearerGuard, IsMaintenanceGuard)
  getAll() {
    return this.roleService.getAll();
  }

  @ApiOperation({ summary: 'Clone a role with its permissions' })
  @ApiBody({ type: CloneRoleDto })
  @Post('clone/:id')
  @HttpCode(200)
  @UseGuards(BearerGuard, IsMaintenanceGuard)
  clone(@Param('id') id: number, @Body() body: CloneRoleDto, @UserScope() user: Users) {
    return this.roleService.clone(id, body, user.id);
  }

  @ApiOperation({ summary: 'Get users assigned to a role' })
  @Get('users/:roleId')
  @UseGuards(BearerGuard, IsMaintenanceGuard)
  getUsersInRole(
    @Param('roleId') roleId: number,
    @Query('search') search: string,
    @PaginationDecorator() paginationParams: PaginationParams,
  ) {
    return this.roleService.getUsersInRole(roleId, search, paginationParams);
  }

  @ApiOperation({ summary: 'Assign users to a role' })
  @ApiBody({ type: AssignUsersRoleDto })
  @Post('assign-users/:roleId')
  @HttpCode(200)
  @UseGuards(BearerGuard, IsMaintenanceGuard)
  assignUsers(@Param('roleId') roleId: number, @Body() body: AssignUsersRoleDto) {
    return this.roleService.assignUsers(roleId, body);
  }

  @ApiOperation({ summary: 'Remove users from a role' })
  @ApiBody({ type: AssignUsersRoleDto })
  @Post('remove-users/:roleId')
  @HttpCode(200)
  @UseGuards(BearerGuard, IsMaintenanceGuard)
  removeUsers(@Param('roleId') roleId: number, @Body() body: AssignUsersRoleDto) {
    return this.roleService.removeUsers(roleId, body);
  }
}
