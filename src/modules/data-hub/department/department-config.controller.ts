import { BearerGuard } from '@common/guards/bearer.guard';
import { RequestWithInfo } from '@common/types/request-with-info';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { dataHubCaller } from '../common/data-hub-caller.util';
import { DH_PERMISSIONS } from '../common/data-hub-permission-codes';
import { DataHubPermissionGuard, RequireDataHubPermission } from '../common/data-hub-permission.guard';
import { DataHubPageQueryDto } from '../common/data-hub-query.util';
import { DepartmentConfigQueryService } from './department-config-query.service';
import { DepartmentConfigWriteService } from './department-config-write.service';
import {
  AddDepartmentMembersDto,
  DepartmentConfigBodyDto,
  RemoveDepartmentMembersDto,
  WritableDepartmentsQueryDto,
} from './dto';

// Department config (Đơn vị phát hành) and its members; every route needs a dh_department_* code.
@Controller('v1/data-hub/department-configs')
@ApiTags('data-hub-department-configs')
@ApiBearerAuth()
@UseGuards(BearerGuard, DataHubPermissionGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class DepartmentConfigController {
  constructor(
    private readonly query: DepartmentConfigQueryService,
    private readonly write: DepartmentConfigWriteService,
  ) {}

  @ApiOperation({ summary: 'List departments (newest first)' })
  @Get()
  @RequireDataHubPermission(DH_PERMISSIONS.DEPARTMENT_VIEW)
  list(@Query() q: DataHubPageQueryDto) {
    return this.query.list(q);
  }

  @ApiOperation({ summary: 'Create a department' })
  @Post()
  @RequireDataHubPermission(DH_PERMISSIONS.DEPARTMENT_CREATE)
  create(@Body() dto: DepartmentConfigBodyDto, @Req() req: RequestWithInfo) {
    return this.write.create(dto, dataHubCaller(req).id);
  }

  @ApiOperation({ summary: 'Department detail with members and their current data-service rights' })
  @Get(':id')
  @RequireDataHubPermission(DH_PERMISSIONS.DEPARTMENT_VIEW)
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.query.detail(id);
  }

  @ApiOperation({ summary: 'Edit a department' })
  @Put(':id')
  @RequireDataHubPermission(DH_PERMISSIONS.DEPARTMENT_UPDATE)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: DepartmentConfigBodyDto, @Req() req: RequestWithInfo) {
    return this.write.update(id, dto, dataHubCaller(req).id);
  }

  @ApiOperation({ summary: 'Soft-delete a department not used by live data services' })
  @Delete(':id')
  @RequireDataHubPermission(DH_PERMISSIONS.DEPARTMENT_DELETE)
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithInfo) {
    return this.write.remove(id, dataHubCaller(req).id);
  }

  @ApiOperation({ summary: 'Users holding a data-service right who are not members yet' })
  @Get(':id/member-candidates')
  @RequireDataHubPermission(DH_PERMISSIONS.DEPARTMENT_UPDATE)
  candidates(@Param('id', ParseIntPipe) id: number, @Query() q: DataHubPageQueryDto) {
    return this.query.candidates(id, q);
  }

  @ApiOperation({ summary: 'Add members' })
  @Post(':id/members')
  @RequireDataHubPermission(DH_PERMISSIONS.DEPARTMENT_UPDATE)
  addMembers(@Param('id', ParseIntPipe) id: number, @Body() dto: AddDepartmentMembersDto, @Req() req: RequestWithInfo) {
    return this.write.addMembers(id, dto.user_ids, dataHubCaller(req).id);
  }

  @ApiOperation({ summary: 'Remove members' })
  @Delete(':id/members')
  @RequireDataHubPermission(DH_PERMISSIONS.DEPARTMENT_UPDATE)
  removeMembers(@Param('id', ParseIntPipe) id: number, @Body() dto: RemoveDepartmentMembersDto) {
    return this.write.removeMembers(id, dto.user_ids);
  }
}

// Departments the caller may pick as Đơn vị phát hành; any logged-in user may ask (empty when none).
@Controller('v1/data-hub/departments')
@ApiTags('data-hub-org')
@ApiBearerAuth()
@UseGuards(BearerGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class WritableDepartmentsController {
  constructor(private readonly query: DepartmentConfigQueryService) {}

  @ApiOperation({ summary: 'Departments the caller may create in (action=create) or update services of (update)' })
  @Get('writable')
  writable(@Query() q: WritableDepartmentsQueryDto, @Req() req: RequestWithInfo) {
    return this.query.writable(dataHubCaller(req), q.action);
  }
}
