import { Module } from '@nestjs/common';
import { PromptAvatarUrlService } from '@modules/prompt-library/prompt-avatar-url.util';
import { DataHubCommonModule } from '../common/data-hub-common.module';
import { DataHubConsumerController } from './data-hub-consumer.controller';
import { DataHubConsumerCountsService } from './data-hub-consumer-counts.service';
import { DataHubConsumerExportService } from './data-hub-consumer-export.service';
import { DataHubConsumerQueryService } from './data-hub-consumer-query.service';
import { DataHubConsumerTermsQueryService } from './data-hub-consumer-terms-query.service';
import { DataHubConsumerWriteService } from './data-hub-consumer-write.service';

// Consumer apps (App thụ hưởng): list, detail, create/edit, status, history, export.
@Module({
  imports: [DataHubCommonModule],
  controllers: [DataHubConsumerController],
  providers: [
    DataHubConsumerTermsQueryService,
    DataHubConsumerCountsService,
    DataHubConsumerQueryService,
    DataHubConsumerWriteService,
    DataHubConsumerExportService,
    PromptAvatarUrlService,
  ],
})
export class DataHubConsumerModule {}
