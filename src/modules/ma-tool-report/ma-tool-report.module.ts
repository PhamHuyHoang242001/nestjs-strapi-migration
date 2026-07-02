import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MaToolCstbRptProperty } from '@modules/databases/ma-tool-cstb-rpt-property.entity';
import { DataAccessModule } from '@modules/data-access/data-access.module';
import { MaToolReportController } from './ma-tool-report.controller';
import { MaToolReportService } from './ma-tool-report.service';

@Module({
  imports: [TypeOrmModule.forFeature([MaToolCstbRptProperty]), DataAccessModule],
  controllers: [MaToolReportController],
  providers: [MaToolReportService],
  exports: [MaToolReportService],
})
export class MaToolReportModule {}
