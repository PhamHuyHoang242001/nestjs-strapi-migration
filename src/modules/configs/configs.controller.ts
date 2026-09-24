import { BearerGuard } from '@common/guards';
import { RequestWithInfo } from '@common/types/request-with-info';
import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigsService } from './configs.service';
import { CreateConfigDto, ListConfigDto, UpdateConfigDto } from './dto/config.dto';

@ApiTags('Configs')
@ApiBearerAuth()
@Controller('v1/configs')
@UseGuards(BearerGuard)
export class ConfigsController {
  constructor(private readonly configsService: ConfigsService) {}

  @Get()
  @ApiOperation({ summary: 'List configs (search, sort, pagination; includes author info)' })
  list(@Query() query: ListConfigDto) {
    return this.configsService.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one config with full detail' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.configsService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a config' })
  create(@Body() body: CreateConfigDto, @Req() req: RequestWithInfo) {
    return this.configsService.create(body, this.userId(req));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a config' })
  update(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateConfigDto, @Req() req: RequestWithInfo) {
    return this.configsService.update(id, body, this.userId(req));
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a config' })
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithInfo) {
    return this.configsService.remove(id, this.userId(req));
  }

  private userId(req: RequestWithInfo) {
    const id = req.info?.user?.['id'];
    return id === undefined || id === null ? undefined : Number(id);
  }
}
