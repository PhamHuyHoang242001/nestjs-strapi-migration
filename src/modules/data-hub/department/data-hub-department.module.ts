import { Module } from '@nestjs/common';
import { DataHubCommonModule } from '../common/data-hub-common.module';
import { DepartmentConfigController, WritableDepartmentsController } from './department-config.controller';
import { DepartmentConfigQueryService } from './department-config-query.service';
import { DepartmentConfigWriteService } from './department-config-write.service';

// Department config (Đơn vị phát hành): catalog CRUD, members, and the writable list for the data-service form.
@Module({
  imports: [DataHubCommonModule],
  controllers: [DepartmentConfigController, WritableDepartmentsController],
  providers: [DepartmentConfigQueryService, DepartmentConfigWriteService],
})
export class DataHubDepartmentModule {}
