import { DataAccess } from '@modules/databases/data-access.entity';
import { Permission } from '@modules/databases/permission.entity';
import { AdminRepository } from '@modules/admins/repository/admin.repository';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataAccessController } from './data-access.controller';
import { DataAccessService } from './data-access.service';
import { HierarchyValidationService } from './hierarchy-validation.service';
import { DataAccessRepository } from './repository/data-access.repository';
import { ReportAccessRecordsController } from './report-access-records.controller';

@Module({
  imports: [TypeOrmModule.forFeature([DataAccess, Permission])],
  controllers: [DataAccessController, ReportAccessRecordsController],
  providers: [DataAccessService, DataAccessRepository, AdminRepository, HierarchyValidationService],
  exports: [DataAccessService, DataAccessRepository],
})
export class DataAccessModule {}
