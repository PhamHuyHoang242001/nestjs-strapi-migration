import { BIHubDiagnosticReport } from '@modules/databases/bi-diagnostic-report.entity';
import { BiHubDiagnosticFile } from '@modules/databases/bi-diagnostic-file.entity';
import { BIHubDiagnosticHistoryReport } from '@modules/databases/bi-diagnostic-history-report.entity';
import { BiDiagnosticLog } from '@modules/databases/bi-diagnostic-log.entity';
import { BIHubDiagnosticReportPics } from '@modules/databases/bi-hub-diagnostic-report-pic.entity';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BiHubDiagnosticReportUserController } from './bi-hub-diagnostic-report-user.controller';
import { BiHubDiagnosticReportAdminController } from './bi-hub-diagnostic-report-admin.controller';
import { BiHubBiccDepartmentHelperController } from './bi-hub-bicc-department-helper.controller';
import { BiHubDiagnosticReportService } from './bi-hub-diagnostic-report.service';
import { BiHubDiagnosticReportPicService } from './bi-hub-diagnostic-report-pic.service';
import { BiHubDiagnosticReportWriteService } from './bi-hub-diagnostic-report-write.service';
import { BiHubBiccDepartmentHelperService } from './bi-hub-bicc-department-helper.service';
import { DiagnosticTransformFileResolver } from './diagnostic-transform-file.resolver';
import { AdminRepository } from '@modules/admins/repository/admin.repository';
import { UserRepository } from '@modules/users/repository/users.repository';
import { DataAccessModule } from '@modules/data-access/data-access.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BIHubDiagnosticReport,
      BiHubDiagnosticFile,
      BIHubDiagnosticHistoryReport,
      BiDiagnosticLog,
      BIHubDiagnosticReportPics,
    ]),
    DataAccessModule,
  ],
  controllers: [
    BiHubDiagnosticReportUserController,
    BiHubDiagnosticReportAdminController,
    BiHubBiccDepartmentHelperController,
  ],
  providers: [
    BiHubDiagnosticReportService,
    BiHubDiagnosticReportPicService,
    BiHubDiagnosticReportWriteService,
    BiHubBiccDepartmentHelperService,
    DiagnosticTransformFileResolver,
    AdminRepository,
    UserRepository,
  ],
  exports: [BiHubDiagnosticReportService, BiHubDiagnosticReportWriteService, DiagnosticTransformFileResolver],
})
export class BiHubDiagnosticReportModule {}
