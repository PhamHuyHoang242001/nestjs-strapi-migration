import { Module } from '@nestjs/common';
import { DataHubCommonModule } from '../common/data-hub-common.module';
import { LogicalTermController } from './logical-term.controller';
import { LogicalTermExportService } from './logical-term-export.service';
import { LogicalTermHistoryService } from './logical-term-history.service';
import { LogicalTermQueryService } from './logical-term-query.service';
import { LogicalTermWriteService } from './logical-term-write.service';
import { PhysicalTermController } from './physical-term.controller';
import { PhysicalTermDetailService } from './physical-term-detail.service';
import { PhysicalTermQueryService } from './physical-term-query.service';
import { SourceTableController } from './source-table.controller';
import { SourceTableQueryService } from './source-table-query.service';

// Data dictionary: logical terms (CRUD, mapping, history, export), read-only physical terms and source tables.
@Module({
  imports: [DataHubCommonModule],
  controllers: [LogicalTermController, PhysicalTermController, SourceTableController],
  providers: [
    LogicalTermQueryService,
    LogicalTermWriteService,
    LogicalTermHistoryService,
    LogicalTermExportService,
    PhysicalTermQueryService,
    PhysicalTermDetailService,
    SourceTableQueryService,
  ],
})
export class DataHubDictionaryModule {}
