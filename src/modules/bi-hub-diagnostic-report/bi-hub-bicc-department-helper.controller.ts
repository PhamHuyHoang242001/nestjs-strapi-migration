import { RequirePermission } from '@common/authorization/decorators/require-permission.decorator';
import { PermissionGuard } from '@common/authorization/guards/permission.guard';
import { BearerGuard } from '@common/guards';
import { IsMaintenanceGuard } from '@common/guards/is-maintenance.guard';
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsNumberString, IsOptional, IsString } from 'class-validator';
import { BiHubBiccDepartmentHelperService } from './bi-hub-bicc-department-helper.service';

// Query DTO for bicc-department helper endpoints
class BiccDepartmentHelperDto {
  @ApiProperty({ required: true })
  @IsNumberString()
  readonly biccDepartmentId: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  readonly keyword?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumberString()
  readonly page?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumberString()
  readonly limit?: string;
}

// BICC department helper endpoints — paths match Strapi user routes exactly
@Controller('bi-hub/bicc-department')
@ApiTags('bi-hub-bicc-department (helpers)')
@ApiBearerAuth()
@UseGuards(BearerGuard, IsMaintenanceGuard, PermissionGuard)
export class BiHubBiccDepartmentHelperController {
  constructor(private readonly service: BiHubBiccDepartmentHelperService) {}

  @ApiOperation({ summary: 'Find admin users by BICC department' })
  @Get('admin')
  @RequirePermission('bh_bicc_dept_view')
  findAdminByDepartment(@Query() query: BiccDepartmentHelperDto) {
    return this.service.findAdminByDepartment(+query.biccDepartmentId, query.keyword, +(query.page || 1), +(query.limit || 10));
  }

  @ApiOperation({ summary: 'Find diagnostic scopes by BICC department' })
  @Get('scope')
  @RequirePermission('bh_bicc_dept_view')
  findScopeByDepartment(@Query() query: BiccDepartmentHelperDto) {
    return this.service.findScopeByDepartment(+query.biccDepartmentId, query.keyword);
  }
}
