import { ServiceTokenGuard } from '@common/guards/service-token.guard';
import { Body, Controller, Get, HttpCode, Post, Query, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiCatalogSyncService } from './api-catalog-sync.service';
import { ApiCatalogSyncLookupService } from './api-catalog-sync-lookup.service';
import { SyncApiCatalogItemDto } from './dto/sync-api-catalog-item.dto';
import { SyncLookupUsersQueryDto } from './dto/sync-lookup-users-query.dto';

// Service-to-service endpoints for third-party sync jobs. Auth is a service token (not a user
// session), kept on its own controller so the user-facing catalog routes keep BearerGuard.
@Controller('v1/ai-hub/api-catalog/sync')
@ApiTags('api-catalog-sync')
@ApiBearerAuth()
@UseGuards(ServiceTokenGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class ApiCatalogSyncController {
  constructor(
    private readonly syncService: ApiCatalogSyncService,
    private readonly lookupService: ApiCatalogSyncLookupService,
  ) {}

  // POST /api/v1/ai-hub/api-catalog/sync — upsert one API by `code` (created / updated / unchanged).
  @ApiOperation({ summary: 'Upsert one API package from a sync job (keyed by code, auto-approved)' })
  @Post()
  @HttpCode(200)
  upsert(@Body() body: SyncApiCatalogItemDto) {
    return this.syncService.upsert(body);
  }

  // Lookups below list the exact values accepted by the relation fields of the sync body.
  @ApiOperation({ summary: 'Valid category_name values' })
  @Get('categories')
  categories() {
    return this.lookupService.categories();
  }

  @ApiOperation({ summary: 'Valid publisher_name values' })
  @Get('publishers')
  publishers() {
    return this.lookupService.publishers();
  }

  @ApiOperation({ summary: 'Valid responsible_emails values (paginated, searchable)' })
  @Get('users')
  users(@Query() query: SyncLookupUsersQueryDto) {
    return this.lookupService.users(query);
  }

  @ApiOperation({ summary: 'Valid coworker_codes values' })
  @Get('coworkers')
  coworkers() {
    return this.lookupService.coworkers();
  }
}
