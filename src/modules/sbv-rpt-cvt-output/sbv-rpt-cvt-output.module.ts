import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MaToolSbvRptCvtOutput } from '@modules/databases/ma-tool-sbv-rpt-cvt-output.entity';
import { MaToolBranchConfig } from '@modules/databases/ma-tool-branch-config.entity';
import { MaToolMappingUserBranch } from '@modules/databases/ma-tool-mapping-user-branch.entity';
import { MaToolCstbRptProperty } from '@modules/databases/ma-tool-cstb-rpt-property.entity';
import { MaToolCstbRptExportMapping } from '@modules/databases/ma-tool-cstb-rpt-export-mapping.entity';
import { MaToolLogDownloadFile } from '@modules/databases/ma-tool-log-download-file.entity';

import { SbvRptCvtOutputController } from './sbv-rpt-cvt-output.controller';
import { SbvRptCvtOutputService } from './sbv-rpt-cvt-output.service';
import { SbvRptCvtOutputS3Service } from './sbv-rpt-cvt-output-s3.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MaToolSbvRptCvtOutput,
      MaToolBranchConfig,
      MaToolMappingUserBranch,
      MaToolCstbRptProperty,
      MaToolCstbRptExportMapping,
      MaToolLogDownloadFile,
    ]),
  ],
  controllers: [SbvRptCvtOutputController],
  providers: [SbvRptCvtOutputService, SbvRptCvtOutputS3Service],
})
export class SbvRptCvtOutputModule {}
