import { Module } from '@nestjs/common';
import { DataHubSystemController } from './data-hub-system.controller';
import { DataHubSystemQueryService } from './data-hub-system-query.service';

// Hệ thống and Dịch vụ hệ thống lists (pickers of the App thụ hưởng form).
@Module({
  controllers: [DataHubSystemController],
  providers: [DataHubSystemQueryService],
})
export class DataHubSystemModule {}
