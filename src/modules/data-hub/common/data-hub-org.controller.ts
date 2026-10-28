import { BearerGuard } from '@common/guards/bearer.guard';
import { RequestWithInfo } from '@common/types/request-with-info';
import { Controller, ForbiddenException, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DataHubOrgService } from './data-hub-org.service';

// Enum values (methods, frequencies, formats…) are not served: FE and BE each declare them.
@ApiTags('data-hub-org')
@ApiBearerAuth()
@UseGuards(BearerGuard)
@Controller('v1/data-hub')
export class DataHubOrgController {
  constructor(private readonly org: DataHubOrgService) {}

  @Get('divisions')
  @ApiOperation({ summary: 'Khối (divisions) for Data Hub forms and filters' })
  listDivisions(@Req() req: RequestWithInfo) {
    this.assertUser(req);
    return this.org.listDivisions();
  }

  @Get('departments')
  @ApiOperation({ summary: 'Phòng ban (departments) for Data Hub forms and filters' })
  listDepartments(@Req() req: RequestWithInfo) {
    this.assertUser(req);
    return this.org.listDepartments();
  }

  @Get('request-units')
  @ApiOperation({ summary: 'Đơn vị yêu cầu (request units / BU) for the data service form' })
  listRequestUnits(@Req() req: RequestWithInfo) {
    this.assertUser(req);
    return this.org.listRequestUnits();
  }

  private assertUser(req: RequestWithInfo): void {
    if (!req.info?.user?.id) throw new ForbiddenException('User not authenticated');
  }
}
