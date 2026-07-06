import { RequirePermission } from '@common/authorization/decorators/require-permission.decorator';
import { PermissionGuard } from '@common/authorization/guards/permission.guard';
import { UserScope } from '@common/decorators';
import { PaginationDecorator, PaginationParams } from '@common/decorators/pagination.decorator';
import { Sort, SortParams } from '@common/decorators/sort.decorator';
import { StatusDto } from '@common/dto';
import { BearerGuard, IsMaintenanceGuard } from '@common/guards';
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Put, Query } from '@nestjs/common/decorators';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SearchRecordsDto } from '@modules/data-access/dto/search-records.dto';
import { ListRoleDto } from './dto';
import { AssignUsersRoleDto } from './dto/assign-users-role.dto';
import { CloneRoleDto } from './dto/clone-role.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RoleService } from './role.service';
import { GroupRoleSyncService } from './group-role-sync.service';
import { User } from '@modules/databases/user.entity';

@Controller('v1/role')
@ApiTags('role')
@ApiBearerAuth()
@UseGuards(BearerGuard, IsMaintenanceGuard, PermissionGuard)
export class RoleController {
  constructor(
    private readonly roleService: RoleService,
    private readonly groupRoleSyncService: GroupRoleSyncService,
  ) {}

  @ApiOperation({
    summary: 'Bulk sync roles + users from group_role_mappings source table (super_admin only)',
  })
  @Post('sync-group-roles')
  @HttpCode(200)
  syncGroupRoles(@UserScope() user: User) {
    // No @RequirePermission: PermissionGuard passes any authenticated user when no codes are set.
    // The super_admin restriction is enforced inside the service.
    return this.groupRoleSyncService.syncGroupRoles(user);
  }

  @ApiOperation({ summary: 'create' })
  @ApiBody({ description: 'create', type: CreateRoleDto })
  @Post('create')
  @HttpCode(200)
  @RequirePermission('perm_role_create')
  async create(@Body() body: CreateRoleDto, @UserScope() user: User) {
    const data = await this.roleService.validateForm(body);
    return this.roleService.create(data, user.id);
  }

  @ApiOperation({ description: 'Search categories by search input' })
  @Get('search')
  @RequirePermission('perm_role_view')
  async search(
    @PaginationDecorator() paginationParams: PaginationParams,
    @Sort({ allowedFields: ['created_at', 'name'] }) sortParams: SortParams,
    @Query() query: ListRoleDto,
  ) {
    return this.roleService.search(query, sortParams, paginationParams);
  }

  @ApiOperation({ description: 'details' })
  @Get('details')
  @RequirePermission('perm_role_view')
  details(@Query('id') id: number) {
    return this.roleService.details(id);
  }

  @ApiOperation({ description: 'update' })
  @ApiBody({ type: UpdateRoleDto })
  @Put('update/:id')
  @RequirePermission('perm_role_update')
  async update(@Param('id') id: number, @Body() body: UpdateRoleDto) {
    const data = await this.roleService.validateFormUpdate(body, id);
    return this.roleService.update(id, data);
  }

  @ApiOperation({ description: 'set-status' })
  @ApiBody({ type: UpdateRoleDto })
  @Patch('set-status/:id')
  @RequirePermission('perm_role_update')
  setStatus(@Param('id') id: number, @Body() body: StatusDto) {
    return this.roleService.setStatus(id, body);
  }

  @Delete('delete/:id')
  @RequirePermission('perm_role_delete')
  delete(@Param('id') id: number) {
    return this.roleService.delete(id);
  }

  @Get('all')
  @RequirePermission('perm_role_view')
  getAll() {
    return this.roleService.getAll();
  }

  @ApiOperation({ summary: 'Clone a role with its permissions' })
  @ApiBody({ type: CloneRoleDto })
  @Post('clone/:id')
  @HttpCode(200)
  @RequirePermission('perm_role_create')
  clone(@Param('id') id: number, @Body() body: CloneRoleDto, @UserScope() user: User) {
    return this.roleService.clone(id, body, user.id);
  }

  @ApiOperation({ summary: 'Get users assigned to a role' })
  @Get('users/:roleId')
  @RequirePermission('perm_role_view')
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
  @RequirePermission('perm_role_update')
  assignUsers(@Param('roleId') roleId: number, @Body() body: AssignUsersRoleDto) {
    return this.roleService.assignUsers(roleId, body);
  }

  @ApiOperation({ summary: 'Remove users from a role' })
  @ApiBody({ type: AssignUsersRoleDto })
  @Post('remove-users/:roleId')
  @HttpCode(200)
  @RequirePermission('perm_role_update')
  removeUsers(@Param('roleId') roleId: number, @Body() body: AssignUsersRoleDto) {
    return this.roleService.removeUsers(roleId, body);
  }

  @ApiOperation({ summary: 'List all records from a root table for owner assignment (no owner scoping)' })
  @Get('owner-resources/:tableName')
  @RequirePermission('perm_role_create', 'perm_role_update')
  listOwnerResources(
    @Param('tableName') tableName: string,
    @Query() query: SearchRecordsDto,
    @PaginationDecorator() pagination: PaginationParams,
  ) {
    return this.roleService.listOwnerResources(tableName, query, pagination);
  }
}
