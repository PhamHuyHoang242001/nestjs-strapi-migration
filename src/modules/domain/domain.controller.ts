import { Controller, Get, Query, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BearerGuard } from '@common/guards/bearer.guard';
import { DomainService } from './domain.service';
import { ListDomainQueryDto } from './dto/list-domain-query.dto';

// Read-only list for pickers; rows are managed through migrations / SQL for now.
@Controller('v1/domains')
@ApiTags('domains')
@ApiBearerAuth()
@UseGuards(BearerGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class DomainController {
  constructor(private readonly service: DomainService) {}

  @Get()
  list(@Query() query: ListDomainQueryDto) {
    return this.service.list(query);
  }
}
