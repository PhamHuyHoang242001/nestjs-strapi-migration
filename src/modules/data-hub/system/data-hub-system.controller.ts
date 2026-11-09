import { BearerGuard } from '@common/guards/bearer.guard';
import { Controller, Get, Query, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DataHubPageQueryDto } from '../common/data-hub-query.util';
import { DataHubSystemQueryService } from './data-hub-system-query.service';

// Read-only Hệ thống picker for the App thụ hưởng form; rows are managed by SQL for now.
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
}
