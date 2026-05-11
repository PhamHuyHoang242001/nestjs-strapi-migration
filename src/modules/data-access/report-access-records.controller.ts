import { RequirePermission } from '@common/authorization/decorators/require-permission.decorator';
import { PermissionGuard } from '@common/authorization/guards/permission.guard';
import { PaginationDecorator, PaginationParams } from '@common/decorators/pagination.decorator';
import { BearerGuard } from '@common/guards';
import { IsMaintenanceGuard } from '@common/guards/is-maintenance.guard';
import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { DataAccessService } from './data-access.service';
import { SearchRecordsDto } from './dto/search-records.dto';

@Controller('v1/report-access')
@ApiTags('report-access')
@ApiBearerAuth()
@UseGuards(BearerGuard, IsMaintenanceGuard, PermissionGuard)
export class ReportAccessRecordsController {
  constructor(private readonly dataAccessService: DataAccessService) {}

  @ApiOperation({ summary: 'Browse records from a whitelisted table' })
  @ApiParam({ name: 'tableName', description: 'Whitelisted table name', example: 'bi_hub_reports' })
  @Get('records/:tableName')
  @RequirePermission('perm_data_access_create')
  getRecords(
    @Param('tableName') tableName: string,
    @Query() query: SearchRecordsDto,
    @PaginationDecorator() pagination: PaginationParams,
  ) {
    return this.dataAccessService.getRecords(tableName, query, pagination);
  }
}
