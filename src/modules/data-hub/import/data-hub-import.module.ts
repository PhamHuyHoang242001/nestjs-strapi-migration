import { Module } from '@nestjs/common';
import { PromptAvatarUrlService } from '@modules/prompt-library/prompt-avatar-url.util';
import { DataHubCommonModule } from '../common/data-hub-common.module';
import { DataHubConsumerWriteService } from '../consumer/data-hub-consumer-write.service';
import { DataHubDataServiceWriteService } from '../data-service/data-hub-data-service-write.service';
import { DataServiceSnapshotService } from '../data-service/data-service-snapshot.service';
import { LogicalTermHistoryService } from '../dictionary/logical-term-history.service';
import { LogicalTermWriteService } from '../dictionary/logical-term-write.service';
import {
  ConsumerImportController,
  DataServiceImportController,
  LogicalTermImportController,
  SourceTableImportController,
} from './data-hub-import.controller';
import { DataServiceImportReferenceLookupService, SourceTableImportLookupService } from './import-lookups.service';
import { SourceTableImportService } from './import-source-tables.service';
import {
  ConsumerImportTemplateService,
  DataServiceImportTemplateService,
  LogicalTermImportTemplateService,
  SourceTableImportTemplateService,
} from './import-templates.service';
import { ConsumerImportService, DataServiceImportService, LogicalTermImportService } from './import.service';

// Bulk imports (create-only, one data sheet per file): App thụ hưởng, Thuật ngữ chuẩn hoá, Dịch vụ API / SFTP and
// Bảng nguồn & thuật ngữ nghiệp vụ. Rows are written through the regular write services of each entity.
@Module({
  imports: [DataHubCommonModule],
  controllers: [
    ConsumerImportController,
    LogicalTermImportController,
    DataServiceImportController,
    SourceTableImportController,
  ],
  providers: [
    // The regular write paths the imports go through.
    DataHubConsumerWriteService,
    PromptAvatarUrlService,
    DataHubDataServiceWriteService,
    DataServiceSnapshotService,
    LogicalTermHistoryService,
    LogicalTermWriteService,
    DataServiceImportReferenceLookupService,
    SourceTableImportLookupService,
    ConsumerImportTemplateService,
    LogicalTermImportTemplateService,
    DataServiceImportTemplateService,
    SourceTableImportTemplateService,
    ConsumerImportService,
    LogicalTermImportService,
    DataServiceImportService,
    SourceTableImportService,
  ],
})
export class DataHubImportModule {}
