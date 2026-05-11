import { RequirePermission } from '@common/authorization/decorators/require-permission.decorator';
import { PermissionGuard } from '@common/authorization/guards/permission.guard';
import { PaginationDecorator, PaginationParams } from '@common/decorators/pagination.decorator';
import { Sort, SortParams } from '@common/decorators/sort.decorator';
import { BearerGuard } from '@common/guards';
import { IsMaintenanceGuard } from '@common/guards/is-maintenance.guard';
import { Controller, Delete, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ChangeHistoryService } from './change-history.service';
import { SearchChangeHistoryDto } from './dto/search-change-history.dto';

@Controller('v1/change-history')
@ApiTags('change-history')
@ApiBearerAuth()
@UseGuards(BearerGuard, IsMaintenanceGuard, PermissionGuard)
export class ChangeHistoryController {
  constructor(private readonly changeHistoryService: ChangeHistoryService) {}

  @ApiOperation({ summary: 'Search change history with pagination' })
  @Get('search')
  @RequirePermission('perm_history_view')
  search(
    @PaginationDecorator() paginationParams: PaginationParams,
    @Sort({ allowedFields: ['created_at', 'entity_type', 'action_type', 'performed_by'] })
    sortParams: SortParams,
    @Query() query: SearchChangeHistoryDto,
  ) {
    return this.changeHistoryService.search(query, sortParams, paginationParams);
  }

  @ApiOperation({ summary: 'Get change history statistics by entity and action type' })
  @Get('stats')
  @RequirePermission('perm_history_view')
  getStats() {
    return this.changeHistoryService.getStats();
  }

  @ApiOperation({ summary: 'Export all matching change history records (no pagination)' })
  @Get('export')
  @RequirePermission('perm_history_view')
  export(@Query() query: SearchChangeHistoryDto) {
    return this.changeHistoryService.export(query);
  }

  @ApiOperation({ summary: 'Clear all change history records' })
  @Delete('clear')
  @RequirePermission('perm_history_view')
  clear() {
    return this.changeHistoryService.clear();
  }
}
