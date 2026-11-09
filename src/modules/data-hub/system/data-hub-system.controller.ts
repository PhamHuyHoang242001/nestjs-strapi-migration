import { BearerGuard } from '@common/guards/bearer.guard';
import { Controller, Get, Query, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DataHubPageQueryDto } from '../common/data-hub-query.util';
import { DataHubSystemQueryService } from './data-hub-system-query.service';
import { ListSystemServiceQueryDto } from './dto/list-system-service-query.dto';

// Read-only pickers for the App thụ hưởng form; rows are managed by SQL for now.
@Controller('v1/data-hub')
@ApiTags('data-hub-systems')
@ApiBearerAuth()
@UseGuards(BearerGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class DataHubSystemController {
  constructor(private readonly query: DataHubSystemQueryService) {}

  @ApiOperation({ summary: 'List Hệ thống (paged, keyword on name)' })
  @Get('systems')
  listSystems(@Query() q: DataHubPageQueryDto) {
    return this.query.listSystems(q);
  }

  @ApiOperation({ summary: 'List Dịch vụ hệ thống (paged, keyword on name, optional system_id)' })
  @Get('system-services')
  listSystemServices(@Query() q: ListSystemServiceQueryDto) {
    return this.query.listSystemServices(q);
  }
}
