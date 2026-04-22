import { BearerGuard } from '@common/guards';
import { IsAdminGuard } from '@common/guards/is-admin.guard';
import { PaginationDecorator, PaginationParams } from '@common/decorators/pagination.decorator';
import { Sort, SortParams } from '@common/decorators/sort.decorator';
import { UsersService } from '@modules/users/users.service';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBasicAuth, ApiTags } from '@nestjs/swagger';
import { SearchUserManagementDto } from './dto/search-user-management.dto';
import { CreateUserManagementDto } from './dto/create-user-management.dto';
import { UpdateUserManagementDto } from './dto/update-user-management.dto';
import { BulkAssignRoleDto, BulkUserActionDto } from './dto/bulk-user-action.dto';

const ALLOWED_SORT_FIELDS = [
  'id',
  'username',
  'full_name',
  'email',
  'department',
  'branch_code',
  'region',
  'created_at',
  'is_active',
];

@Controller('v1/users-management')
@ApiTags('users management')
@ApiBearerAuth()
@ApiBasicAuth()
@UseGuards(BearerGuard, IsAdminGuard)
export class UsersManagementController {
  constructor(private readonly usersService: UsersService) {}

  /** Search/list users with advanced filters, pagination, and sorting. */
  @Get()
  @Sort({ allowedFields: ALLOWED_SORT_FIELDS, default: { sort_field: 'id', sort_order: 'DESC' } })
  async searchAdmin(
    @Query() dto: SearchUserManagementDto,
    @Sort({ allowedFields: ALLOWED_SORT_FIELDS, default: { sort_field: 'id', sort_order: 'DESC' } })
    sortParams: SortParams,
    @PaginationDecorator() pagination: PaginationParams,
  ) {
    return this.usersService.searchAdmin(dto, sortParams, pagination);
  }

  /** Get full user detail including roles, permission exceptions, and change history. */
  @Get(':id')
  async detailAdmin(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.detailAdmin(id);
  }

  /** Create a new user with optional role assignments. */
  @Post('create')
  @HttpCode(200)
  async createAdmin(@Body() dto: CreateUserManagementDto) {
    return this.usersService.createAdmin(dto);
  }

  /** Update user fields; pass role_ids to fully replace the role set. */
  @Put('update/:id')
  async updateAdmin(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUserManagementDto) {
    return this.usersService.updateAdmin(id, dto);
  }

  /** Toggle is_active for a single user. */
  @Patch('toggle-active/:id')
  async toggleActive(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.toggleActive(id);
  }

  /** Soft-delete a user by id. */
  @Delete('delete/:id')
  async deleteAdmin(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.deleteAdmin(id);
  }

  /** Toggle is_active for multiple users. */
  @Patch('bulk-toggle-active')
  async bulkToggleActive(@Body() dto: BulkUserActionDto) {
    return this.usersService.bulkToggleActive(dto);
  }

  /** Assign a role to multiple users (skips existing assignments). */
  @Post('bulk-assign-role')
  @HttpCode(200)
  async bulkAssignRole(@Body() dto: BulkAssignRoleDto) {
    return this.usersService.bulkAssignRole(dto);
  }

  /** Remove a role from multiple users. */
  @Post('bulk-remove-role')
  @HttpCode(200)
  async bulkRemoveRole(@Body() dto: BulkAssignRoleDto) {
    return this.usersService.bulkRemoveRole(dto);
  }
}
