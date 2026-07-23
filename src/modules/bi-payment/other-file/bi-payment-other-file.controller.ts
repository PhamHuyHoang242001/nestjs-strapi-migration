import { RequireDataAccess } from '@common/authorization/decorators/require-data-access.decorator';
import { RequirePermission } from '@common/authorization/decorators/require-permission.decorator';
import { OwnerScopeGuard } from '@common/authorization/guards/owner-scope.guard';
import { PermissionGuard } from '@common/authorization/guards/permission.guard';
import { DataAccessInterceptor } from '@common/authorization/interceptors/data-access.interceptor';
import { DATA_ACCESS_TABLE } from '@common/enums';
import { BearerGuard } from '@common/guards';
import { IsMaintenanceGuard } from '@common/guards/is-maintenance.guard';
import { RequestWithInfo } from '@common/types/request-with-info';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { BiPaymentOtherFileService } from './bi-payment-other-file.service';
import { SearchBiPaymentOtherFileDto, UploadBiPaymentOtherFileDto } from './dto';

const TABLE = DATA_ACCESS_TABLE.BI_PAYMENT_PROGRAMS;

// Strapi parity: /bi-payment/orther-file (Strapi typo "orther" — giữ y để frontend ko đổi).
// Subtree checklist→program→project. Attachment = file op → gate bp_program_upload
// (lockstep with checklist so an uploader can both create a checklist and attach files).
@Controller('bi-payment/orther-file')
@ApiTags('bi-payment-other-file')
@ApiBearerAuth()
@UseGuards(BearerGuard, IsMaintenanceGuard, PermissionGuard, OwnerScopeGuard)
@UseInterceptors(DataAccessInterceptor)
export class BiPaymentOtherFileController {
  constructor(private readonly service: BiPaymentOtherFileService) {}

  // GET /bi-payment/orther-file?programId=X&type=Y — Strapi findAllOtherFile.
  @ApiOperation({ summary: 'List other-files by program' })
  @Get()
  @RequirePermission('bp_program_upload')
  @RequireDataAccess(TABLE, 'bp_program_upload')
  search(@Query() query: SearchBiPaymentOtherFileDto, @Req() req: RequestWithInfo) {
    return this.service.list(query, req.info?.dataScope ?? null);
  }

  // GET /bi-payment/orther-file/user-created — Strapi findUserCreatedOtherFile.
  @ApiOperation({ summary: 'List other-files created by current user' })
  @Get('user-created')
  @RequirePermission('bp_program_upload')
  @RequireDataAccess(TABLE, 'bp_program_upload')
  userCreated(@Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number | undefined;
    return this.service.listUserCreated(userId ? +userId : 0, req.info?.dataScope ?? null);
  }

  // GET /bi-payment/orther-file/download-multiple?ids=1,2,3 — Strapi downloadMultipleOtherFiles.
  @ApiOperation({ summary: 'Download multiple other-files metadata' })
  @Get('download-multiple')
  @RequirePermission('bp_program_upload')
  @RequireDataAccess(TABLE, 'bp_program_upload')
  async downloadMultiple(@Query('ids') ids: string, @Req() req: RequestWithInfo, @Res() res: Response) {
    const idArr = ids
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n > 0);
    const files = await this.service.getForDownload(idArr, req.info?.dataScope ?? null);
    if (!files.length) {
      res.status(404);
      return res.json({ message: 'No accessible files' });
    }
    return res.json({ files });
  }

  // POST /bi-payment/orther-file — Strapi createOtherFileByCheckListId (body checkListId+files).
  @ApiOperation({ summary: 'Upload other-files for a checklist' })
  @Post()
  @RequirePermission('bp_program_upload')
  @RequireDataAccess(TABLE, 'bp_program_upload')
  upload(@Body() dto: UploadBiPaymentOtherFileDto, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number | undefined;
    return this.service.upload(dto, req.info?.dataScope ?? null, userId ? +userId : undefined);
  }

  // DELETE /bi-payment/orther-file/:id — soft delete.
  @ApiOperation({ summary: 'Delete other-file (soft delete)' })
  @Delete(':id')
  @RequirePermission('bp_program_upload')
  @RequireDataAccess(TABLE, 'bp_program_upload')
  delete(@Param('id') id: number, @Req() req: RequestWithInfo) {
    return this.service.delete(+id, req.info?.dataScope ?? null);
  }
}
