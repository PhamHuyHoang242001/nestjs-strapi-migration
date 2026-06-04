import { BearerGuard, IsMaintenanceGuard } from '@common/guards';
import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigDataSelfServeService } from './config-data-self-serve.service';
import {
  CreateConfigDataSelfServeDto,
  SearchConfigDataSelfServeDto,
  UpdateConfigDataSelfServeDto,
} from './dto/config-data-self-serve.dto';

@Controller()
@ApiTags('config-data-self-serve')
@ApiBearerAuth()
@UseGuards(BearerGuard, IsMaintenanceGuard)
export class ConfigDataSelfServeController {
  constructor(private readonly service: ConfigDataSelfServeService) {}

  @ApiOperation({ summary: 'List config data self-serve (paginated)' })
  @Get('config-data-self-serve')
  findAll(@Query() query: SearchConfigDataSelfServeDto) {
    return this.service.findAll(query);
  }

  @ApiOperation({ summary: 'Get config data self-serve by ID' })
  @Get('config-data-self-serve/:id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @ApiOperation({ summary: 'Create config data self-serve' })
  @Post('config-data-self-serve')
  create(@Body() body: CreateConfigDataSelfServeDto) {
    return this.service.create(body);
  }

  @ApiOperation({ summary: 'Update config data self-serve' })
  @Patch('config-data-self-serve/:id')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateConfigDataSelfServeDto) {
    return this.service.update(id, body);
  }

  @ApiOperation({ summary: 'Delete config data self-serve' })
  @Delete('config-data-self-serve/:id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
