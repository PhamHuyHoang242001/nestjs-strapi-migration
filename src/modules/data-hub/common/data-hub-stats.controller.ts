import { BearerGuard } from '@common/guards/bearer.guard';
import { RequestWithInfo } from '@common/types/request-with-info';
import { Controller, ForbiddenException, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DataHubStatsService } from './data-hub-stats.service';

@ApiTags('data-hub-stats')
@ApiBearerAuth()
@UseGuards(BearerGuard)
@Controller('v1/data-hub')
export class DataHubStatsController {
  constructor(private readonly statsService: DataHubStatsService) {}

  @Get('stats')
  @ApiOperation({ summary: 'KPI shared by the catalog, consumers and dictionary tabs (active totals)' })
  stats(@Req() req: RequestWithInfo) {
    if (!req.info?.user?.id) throw new ForbiddenException('User not authenticated');
    return this.statsService.stats();
  }
}
