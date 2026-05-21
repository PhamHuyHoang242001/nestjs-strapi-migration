import { BearerGuard, HeaderGuard, IsMaintenanceGuard } from '@common/guards';
import { RequestWithInfo } from '@common/types/request-with-info';
import { Body, Controller, Get, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { DataSelfServeService } from './data-self-serve.service';
import { DataSelfServeStorageService } from './data-self-serve-storage.service';
import {
  CreateDataSelfServeRequestDto,
  DataSelfServeRequestGroupQueryDto,
  SearchDataSelfServeRequestDto,
  SubmitDataSelfServeRequestDto,
  UpdateDataSelfServeRequestDto,
  ValidateDataSelfServeFileDto,
} from './dto/data-self-serve.dto';

@Controller()
@ApiTags('data-self-serve')
export class DataSelfServeController {
  constructor(
    private readonly service: DataSelfServeService,
    private readonly storageService: DataSelfServeStorageService,
  ) {}

  @Get('data-self-serve/request')
  @ApiBearerAuth()
  @UseGuards(BearerGuard, IsMaintenanceGuard)
  findRequest(@Query() query: SearchDataSelfServeRequestDto, @Req() req: RequestWithInfo) {
    return this.service.findRequest(query, Number(req.info.user?.id));
  }

  @Get('data-self-serve/usage/remaining')
  @ApiBearerAuth()
  @UseGuards(BearerGuard, IsMaintenanceGuard)
  getRemaining(@Query() query: DataSelfServeRequestGroupQueryDto, @Req() req: RequestWithInfo) {
    return this.service.getRemaining(Number(req.info.user?.id), query.requestGroup);
  }

  @Get('data-self-serve/request/config')
  @ApiBearerAuth()
  @UseGuards(BearerGuard, IsMaintenanceGuard)
  getRequestConfig() {
    return this.service.getRequestConfig();
  }

  @Get('data-self-serve/request/stats')
  @ApiBearerAuth()
  @UseGuards(BearerGuard, IsMaintenanceGuard)
  getRequestStats(@Query() query: SearchDataSelfServeRequestDto, @Req() req: RequestWithInfo) {
    return this.service.getRequestStats(query, Number(req.info.user?.id));
  }

  @Get('data-self-serve/request/:id')
  @ApiBearerAuth()
  @UseGuards(BearerGuard, IsMaintenanceGuard)
  findOneRequest(@Param('id') id: string, @Req() req: RequestWithInfo) {
    return this.service.findOneRequest(Number(id), Number(req.info.user?.id));
  }

  @Get('data-self-serve/request/download/:id')
  @ApiBearerAuth()
  @UseGuards(BearerGuard, IsMaintenanceGuard)
  async downloadOutput(@Param('id') id: string, @Req() req: RequestWithInfo, @Res() res: Response) {
    const file = await this.service.getOutputFileInfo(Number(id), Number(req.info.user?.id));
    return this.storageService.streamFile(file.path, file.fileName, res);
  }

  @Get('data-self-serve/request/file-input/download/:id')
  @ApiBearerAuth()
  @UseGuards(BearerGuard, IsMaintenanceGuard)
  async downloadInput(@Param('id') id: string, @Req() req: RequestWithInfo, @Res() res: Response) {
    const file = await this.service.getInputFileInfo(Number(id), Number(req.info.user?.id));
    return this.storageService.streamFile(file.path, file.fileName, res);
  }

  @Post('data-self-serve')
  @ApiBearerAuth()
  @UseGuards(BearerGuard, IsMaintenanceGuard)
  create(@Body() body: CreateDataSelfServeRequestDto, @Req() req: RequestWithInfo) {
    return this.service.create(body, req.info.user);
  }

  @Post('data-self-serve/validate')
  @ApiBearerAuth()
  @UseGuards(BearerGuard, IsMaintenanceGuard)
  validateFileInput(@Body() body: ValidateDataSelfServeFileDto, @Req() req: RequestWithInfo) {
    return this.service.validateFileInput(body, req.info.user);
  }

  @Post('data-self-serve/submit-request/:id')
  @ApiBearerAuth()
  @UseGuards(BearerGuard, IsMaintenanceGuard)
  submitRequestToDpc(
    @Param('id') id: string,
    @Body() body: SubmitDataSelfServeRequestDto,
    @Req() req: RequestWithInfo,
  ) {
    return this.service.submitRequestToDpc(Number(id), body, req.info.user);
  }

  @Patch('service/data-self-serve/:id')
  @ApiOperation({ summary: 'Service callback updates a processing data self-serve request' })
  @UseGuards(HeaderGuard)
  update(@Param('id') id: string, @Body() body: UpdateDataSelfServeRequestDto) {
    return this.service.update(Number(id), body);
  }
}
