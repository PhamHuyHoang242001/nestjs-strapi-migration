import { EventEmitterModule } from '@nestjs/event-emitter';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigDataSelfServe } from '@modules/databases/config-data-self-serve.entity';
import { DataSelfServeIndustry } from '@modules/databases/data-self-serve-industry.entity';
import { DataSelfServeRequest } from '@modules/databases/data-self-serve-request.entity';
import { DataSelfServeSegment } from '@modules/databases/data-self-serve-segment.entity';
import { DataSelfServeValidationLog } from '@modules/databases/data-self-serve-validation-log.entity';
import { MaToolBranchConfig } from '@modules/databases/ma-tool-branch-config.entity';
import { MaToolDataServiceCenter } from '@modules/databases/ma-tool-data-service-center.entity';
import { Users } from '@modules/databases/user.entity';
import { DataSelfServeController } from './data-self-serve.controller';
import { DataSelfServeListener } from './data-self-serve.listener';
import { DataSelfServeQuotaService } from './data-self-serve-quota.service';
import { DataSelfServeService } from './data-self-serve.service';
import { DataSelfServeStorageService } from './data-self-serve-storage.service';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    TypeOrmModule.forFeature([
      ConfigDataSelfServe,
      DataSelfServeRequest,
      DataSelfServeValidationLog,
      DataSelfServeSegment,
      DataSelfServeIndustry,
      MaToolBranchConfig,
      MaToolDataServiceCenter,
      Users,
    ]),
  ],
  controllers: [DataSelfServeController],
  providers: [DataSelfServeService, DataSelfServeQuotaService, DataSelfServeStorageService, DataSelfServeListener],
})
export class DataSelfServeModule {}
