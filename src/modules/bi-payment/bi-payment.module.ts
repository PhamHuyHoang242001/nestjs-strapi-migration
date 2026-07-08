import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BiPaymentDocument } from '@modules/databases/bi-payment-document.entity';
import { BiPaymentTemplate } from '@modules/databases/bi-payment-template.entity';
import { BiPaymentLogMergeFile } from '@modules/databases/bi-payment-log-merge-file.entity';
import { BiPaymentProgram } from '@modules/databases/bi-payment-program.entity';
import { BiPaymentProgramHistory } from '@modules/databases/bi-payment-program-history.entity';
import { BiPaymentProgramLogChange } from '@modules/databases/bi-payment-program-log-change.entity';
import { BiPaymentProjectHistory } from '@modules/databases/bi-payment-project-history.entity';
import { BiPaymentProgramPicConfirm } from '@modules/databases/bi-payment-program-pic-confirm.entity';
import { BiPaymentProject } from '@modules/databases/bi-payment-project.entity';
import { BiPaymentChecklist } from '@modules/databases/bi-payment-checklist.entity';
import { BiPaymentComment } from '@modules/databases/bi-payment-comment.entity';
import { BiPaymentCategory } from '@modules/databases/bi-payment-category.entity';
import { BiPaymentOtherFile } from '@modules/databases/bi-payment-other-file.entity';
import { DataAccessModule } from '@modules/data-access/data-access.module';
import { BiPaymentProjectController } from './project/bi-payment-project.controller';
import { BiPaymentProjectService } from './project/bi-payment-project.service';
import { BiPaymentProgramController } from './program/bi-payment-program.controller';
import { BiPaymentProgramStepController } from './program/bi-payment-program-step.controller';
import { BiPaymentProgramService } from './program/bi-payment-program.service';
import { BiPaymentDocumentController } from './document/bi-payment-document.controller';
import { BiPaymentDocumentService } from './document/bi-payment-document.service';
import { BiPaymentChecklistController } from './checklist/bi-payment-checklist.controller';
import { BiPaymentChecklistService } from './checklist/bi-payment-checklist.service';
import { BiPaymentCommentController } from './comment/bi-payment-comment.controller';
import { BiPaymentCommentService } from './comment/bi-payment-comment.service';
import { BiPaymentTemplateController } from './template/bi-payment-template.controller';
import { BiPaymentTemplateService } from './template/bi-payment-template.service';
import { BiPaymentCategoryController } from './category/bi-payment-category.controller';
import { BiPaymentCategoryService } from './category/bi-payment-category.service';
import { BiPaymentOtherFileController } from './other-file/bi-payment-other-file.controller';
import { BiPaymentOtherFileService } from './other-file/bi-payment-other-file.service';
import { BiPaymentHistoryController } from './history/bi-payment-history.controller';
import { BiPaymentHistoryService } from './history/bi-payment-history.service';
import { BiPaymentReportController } from './report/bi-payment-report.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BiPaymentProject,
      BiPaymentProgram,
      BiPaymentProgramPicConfirm,
      BiPaymentProgramHistory,
      BiPaymentProgramLogChange,
      BiPaymentProjectHistory,
      BiPaymentDocument,
      BiPaymentTemplate,
      BiPaymentLogMergeFile,
      BiPaymentChecklist,
      BiPaymentComment,
      BiPaymentCategory,
      BiPaymentOtherFile,
    ]),
    DataAccessModule,
  ],
  controllers: [
    BiPaymentProjectController,
    BiPaymentProgramController,
    BiPaymentProgramStepController,
    BiPaymentDocumentController,
    BiPaymentChecklistController,
    BiPaymentCommentController,
    BiPaymentTemplateController,
    BiPaymentCategoryController,
    BiPaymentOtherFileController,
    BiPaymentHistoryController,
    BiPaymentReportController,
  ],
  providers: [
    BiPaymentProjectService,
    BiPaymentProgramService,
    BiPaymentDocumentService,
    BiPaymentChecklistService,
    BiPaymentCommentService,
    BiPaymentTemplateService,
    BiPaymentCategoryService,
    BiPaymentOtherFileService,
    BiPaymentHistoryService,
  ],
  exports: [
    BiPaymentProjectService,
    BiPaymentProgramService,
    BiPaymentDocumentService,
    BiPaymentChecklistService,
    BiPaymentCommentService,
    BiPaymentTemplateService,
    BiPaymentCategoryService,
    BiPaymentOtherFileService,
    BiPaymentHistoryService,
  ],
})
export class BiPaymentModule {}
