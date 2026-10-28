import { Module } from '@nestjs/common';
import { DataHubAccessController } from './data-hub-access.controller';
import { DataHubAccessService } from './data-hub-access.service';
import { DataHubPermissionGuard } from './data-hub-permission.guard';
import { DataHubOrgController } from './data-hub-org.controller';
import { DataHubOrgService } from './data-hub-org.service';
import { DataHubStatsController } from './data-hub-stats.controller';
import { DataHubStatsService } from './data-hub-stats.service';
import { DataHubUserRefService } from './data-hub-user-ref.service';

// Shared Data Hub providers (user refs, access checks) + org lists, the shared KPI stats and my-permissions.
@Module({
  controllers: [DataHubOrgController, DataHubStatsController, DataHubAccessController],
  providers: [
    DataHubOrgService,
    DataHubStatsService,
    DataHubUserRefService,
    DataHubAccessService,
    DataHubPermissionGuard,
  ],
  exports: [DataHubUserRefService, DataHubAccessService, DataHubPermissionGuard],
})
export class DataHubCommonModule {}
