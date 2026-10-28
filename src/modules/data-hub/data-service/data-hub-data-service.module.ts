import { Module } from '@nestjs/common';
import { DataHubCommonModule } from '../common/data-hub-common.module';
import { DataHubDataServiceController } from './data-hub-data-service.controller';
import { DataHubDataServiceDetailQueryService } from './data-hub-data-service-detail-query.service';
import { DataHubDataServiceExportService } from './data-hub-data-service-export.service';
import { DataHubDataServiceHistoryService } from './data-hub-data-service-history.service';
import { DataHubDataServiceListQueryService } from './data-hub-data-service-list-query.service';
import { DataHubDataServiceTermsQueryService } from './data-hub-data-service-terms-query.service';
import { DataHubDataServiceWriteService } from './data-hub-data-service-write.service';
import { DataServiceSnapshotService } from './data-service-snapshot.service';
import { LogicalTermHistoryService } from '../dictionary/logical-term-history.service';

// Data services (package + version): catalog, detail, create/edit, status, history, export.
@Module({
  imports: [DataHubCommonModule],
  controllers: [DataHubDataServiceController],
  providers: [
    DataHubDataServiceListQueryService,
    DataHubDataServiceDetailQueryService,
    DataHubDataServiceHistoryService,
    DataHubDataServiceTermsQueryService,
    DataHubDataServiceWriteService,
    DataHubDataServiceExportService,
    DataServiceSnapshotService,
    // Logical history is written when a service's terms that are mapped to a logical change.
    LogicalTermHistoryService,
  ],
})
export class DataHubDataServiceModule {}
