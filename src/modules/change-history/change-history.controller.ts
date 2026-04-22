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
export class ChangeHistoryController {
  constructor(private readonly changeHistoryService: ChangeHistoryService) {}

  @ApiOperation({ summary: 'Search change history with pagination' })
  @Get('search')
  @UseGuards(BearerGuard, IsMaintenanceGuard)
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
  @UseGuards(BearerGuard, IsMaintenanceGuard)
  getStats() {
    return this.changeHistoryService.getStats();
  }

  @ApiOperation({ summary: 'Export all matching change history records (no pagination)' })
  @Get('export')
  @UseGuards(BearerGuard, IsMaintenanceGuard)
  export(@Query() query: SearchChangeHistoryDto) {
    return this.changeHistoryService.export(query);
  }

  @ApiOperation({ summary: 'Clear all change history records' })
  @Delete('clear')
  @UseGuards(BearerGuard, IsMaintenanceGuard)
  clear() {
    return this.changeHistoryService.clear();
  }
}
