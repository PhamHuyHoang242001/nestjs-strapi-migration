import { Controller, Get, Param, ParseIntPipe, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';

import { BearerGuard } from '@common/guards';
import { RequestWithInfo } from '@common/types/request-with-info';
import { SearchReportQueryDto } from './dto';
import { SbvRptCvtOutputService } from './sbv-rpt-cvt-output.service';

@Controller('ma-tool/download-reports')
@ApiTags('MA Tool - SBV Report Download')
@ApiBearerAuth()
@UseGuards(BearerGuard)
export class SbvRptCvtOutputController {
  constructor(private readonly service: SbvRptCvtOutputService) {}

  @Get('search')
  @ApiOperation({ summary: 'Search converted SBV reports with branch/frequency filters' })
  searchReport(@Query() query: SearchReportQueryDto, @Req() req: RequestWithInfo) {
    return this.service.searchReport(query, req.info.user);
  }

  @Post(':id')
  @ApiOperation({ summary: 'Download report zip file by log ID' })
  downloadReports(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: RequestWithInfo,
    @Res() res: Response,
  ) {
    return this.service.downloadReports(id, req.info.user, res);
  }
}
