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
import { LogicalTermWriteService } from '../dictionary/logical-term-write.service';
import { DataServiceImportController } from './import/data-service-import.controller';
import { DataServiceImportReferenceLookupService } from './import/data-service-import-reference-lookup.service';
import { DataServiceImportTemplateService } from './import/data-service-import-template.service';
import { DataServiceImportService } from './import/data-service-import.service';

// Data services (package + version): catalog, detail, create/edit, status, history, export, bulk import.
@Module({
  imports: [DataHubCommonModule],
  controllers: [DataHubDataServiceController, DataServiceImportController],
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
    // Bulk import: creates services through the write service and new logical terms through their write service.
    LogicalTermWriteService,
    DataServiceImportReferenceLookupService,
    DataServiceImportTemplateService,
    DataServiceImportService,
  ],
})
export class DataHubDataServiceModule {}
