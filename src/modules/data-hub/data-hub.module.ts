import { Module } from '@nestjs/common';
import { DataHubCommonModule } from './common/data-hub-common.module';
import { DataHubConsumerModule } from './consumer/data-hub-consumer.module';
import { DataHubDataServiceModule } from './data-service/data-hub-data-service.module';
import { DataHubDepartmentModule } from './department/data-hub-department.module';
import { DataHubImportModule } from './import/data-hub-import.module';
import { DataHubDictionaryModule } from './dictionary/data-hub-dictionary.module';

// Data Hub (Data Exchange): data services, data dictionary, consumer apps — mounted at /api/v1/data-hub.
@Module({
  imports: [
    DataHubCommonModule,
    DataHubDataServiceModule,
    DataHubDictionaryModule,
    DataHubConsumerModule,
    DataHubDepartmentModule,
    DataHubImportModule,
  ],
})
export class DataHubModule {}
