import { BearerGuard } from '@common/guards/bearer.guard';
import { RequestWithInfo } from '@common/types/request-with-info';
import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DataHubAccessService } from './data-hub-access.service';
import { dataHubCaller } from './data-hub-caller.util';

@ApiTags('data-hub-access')
@ApiBearerAuth()
@UseGuards(BearerGuard)
@Controller('v1/data-hub')
export class DataHubAccessController {
  constructor(private readonly access: DataHubAccessService) {}

  @Get('my-permissions')
  @ApiOperation({ summary: 'Data Hub flags of the caller, used by the FE to show or hide actions' })
  async myPermissions(@Req() req: RequestWithInfo) {
    return this.access.myPermissions(dataHubCaller(req));
  }
}
