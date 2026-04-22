import { BearerGuard } from '@common/guards';
import { IsMaintenanceGuard } from '@common/guards/is-maintenance.guard';
import { Body, Controller, Get, HttpCode, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UpdatePermissionMatrixDto } from './dto/update-permission-matrix.dto';
import { PermissionMatrixService } from './permission-matrix.service';

@Controller('v1/permission-matrix')
@ApiTags('permission-matrix')
@ApiBearerAuth()
export class PermissionMatrixController {
  constructor(private readonly permissionMatrixService: PermissionMatrixService) {}

  @ApiOperation({ summary: 'Get permission matrix grid for a role' })
  @Get('role/:roleId')
  @UseGuards(BearerGuard, IsMaintenanceGuard)
  getMatrixForRole(@Param('roleId') roleId: number) {
    return this.permissionMatrixService.getMatrixForRole(roleId);
  }

  @ApiOperation({ summary: 'Update permission matrix for a role' })
  @Put('role/:roleId')
  @HttpCode(200)
  @UseGuards(BearerGuard, IsMaintenanceGuard)
  updateMatrixForRole(@Param('roleId') roleId: number, @Body() body: UpdatePermissionMatrixDto) {
    return this.permissionMatrixService.updateMatrixForRole(roleId, body);
  }

  @ApiOperation({ summary: 'Get permission matrix summary for all roles' })
  @Get('summary')
  @UseGuards(BearerGuard, IsMaintenanceGuard)
  getSummary() {
    return this.permissionMatrixService.getSummary();
  }
}
