import { BearerGuard } from '@common/guards/bearer.guard';
import { RequestWithInfo } from '@common/types/request-with-info';
import { Controller, Get, Param, ParseIntPipe, Query, Req, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { dataHubCaller } from '../common/data-hub-caller.util';
import { ListAvailablePhysicalTermQueryDto } from './dto';
import { PhysicalTermDetailService } from './physical-term-detail.service';
import { PhysicalTermQueryService } from './physical-term-query.service';

// Read-only: physical terms are created, edited and deleted from their data service's form.
// Static routes (available) are declared before ':id'.
@Controller('v1/data-hub/physical-terms')
@ApiTags('data-hub-physical-terms')
@ApiBearerAuth()
@UseGuards(BearerGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class PhysicalTermController {
  constructor(
    private readonly queryService: PhysicalTermQueryService,
    private readonly detailService: PhysicalTermDetailService,
  ) {}

  @ApiOperation({ summary: 'Physical terms a logical term form can attach (with source table and service)' })
  @Get('available')
  available(@Query() q: ListAvailablePhysicalTermQueryDto, @Req() req: RequestWithInfo) {
    dataHubCaller(req);
    return this.queryService.available(q);
  }

  @ApiOperation({ summary: 'Physical term detail (read-only)' })
  @Get(':id')
  getById(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithInfo) {
    dataHubCaller(req);
    return this.detailService.getById(id);
  }
}
