import { BIHubDiagnosticReport } from '@modules/databases/bi-diagnostic-report.entity';
import { BiHubDiagnosticFile } from '@modules/databases/bi-diagnostic-file.entity';
import { BIHubDiagnosticHistoryReport } from '@modules/databases/bi-diagnostic-history-report.entity';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BiHubDiagnosticReportUserController } from './bi-hub-diagnostic-report-user.controller';
import { BiHubDiagnosticReportAdminController } from './bi-hub-diagnostic-report-admin.controller';
import { BiHubBiccDepartmentHelperController } from './bi-hub-bicc-department-helper.controller';
import { BiHubDiagnosticReportService } from './bi-hub-diagnostic-report.service';
import { BiHubDiagnosticReportWriteService } from './bi-hub-diagnostic-report-write.service';
import { BiHubBiccDepartmentHelperService } from './bi-hub-bicc-department-helper.service';
import { AdminRepository } from '@modules/admins/repository/admin.repository';
import { UserRepository } from '@modules/users/repository/users.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BIHubDiagnosticReport,
      BiHubDiagnosticFile,
      BIHubDiagnosticHistoryReport,
    ]),
  ],
  controllers: [
    BiHubDiagnosticReportUserController,
    BiHubDiagnosticReportAdminController,
    BiHubBiccDepartmentHelperController,
  ],
  providers: [
    BiHubDiagnosticReportService,
    BiHubDiagnosticReportWriteService,
    BiHubBiccDepartmentHelperService,
    AdminRepository,
    UserRepository,
  ],
  exports: [BiHubDiagnosticReportService, BiHubDiagnosticReportWriteService],
})
export class BiHubDiagnosticReportModule {}
