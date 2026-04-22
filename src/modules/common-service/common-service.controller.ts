import { Controller, Get, HttpCode, UseGuards } from '@nestjs/common';
import { CommonServiceService } from './common-service.service';
import { ApiBasicAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DynamicAuthGuard, IsMaintenanceGuard } from '@common/guards';

@ApiTags('Common Service')
@Controller('v1/common-service')
export class CommonServiceController {
  constructor(private readonly commonServiceService: CommonServiceService) {}

  @ApiOperation({ summary: 'get list country' })
  @ApiBody({
    description: 'get list country',
  })
  @Get('countries')
  @HttpCode(200)
  @ApiBasicAuth()
  @UseGuards(DynamicAuthGuard, IsMaintenanceGuard)
  async getListCountry() {
    return this.commonServiceService.getListCountry();
  }
}
