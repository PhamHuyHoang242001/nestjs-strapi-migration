import { BearerGuard } from '@common/guards/bearer.guard';
import { RequestWithInfo } from '@common/types/request-with-info';
import { Controller, Get, Param, ParseIntPipe, Query, Req, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { dataHubCaller } from '../common/data-hub-caller.util';
import { ListSourceTableQueryDto, SelectableSourceTableQueryDto } from './dto';
import { SourceTableQueryService } from './source-table-query.service';

// Bảng nguồn dịch vụ (read-only here; written from the data-service form). Static routes come before ':id'.
@Controller('v1/data-hub/source-tables')
@ApiTags('data-hub-source-tables')
@ApiBearerAuth()
@UseGuards(BearerGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class SourceTableController {
  constructor(private readonly query: SourceTableQueryService) {}

  @ApiOperation({
    summary: 'Dictionary: source tables with terms, paged (newest first), filterable by department/division',
  })
  @Get()
  list(@Query() q: ListSourceTableQueryDto, @Req() req: RequestWithInfo) {
    dataHubCaller(req);
    return this.query.list(q);
  }

  @ApiOperation({ summary: "Data-service form picker: source tables of the caller's departments" })
  @Get('selectable')
  selectable(@Query() q: SelectableSourceTableQueryDto, @Req() req: RequestWithInfo) {
    return this.query.selectable(dataHubCaller(req), q);
  }

  @ApiOperation({ summary: 'Terms of one source table (each with its service)' })
  @Get(':id/terms')
  terms(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithInfo) {
    dataHubCaller(req);
    return this.query.terms(id);
  }
}
