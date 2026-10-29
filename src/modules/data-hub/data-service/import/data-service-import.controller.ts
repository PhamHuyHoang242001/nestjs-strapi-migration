import { BearerGuard } from '@common/guards/bearer.guard';
import { RequestWithInfo } from '@common/types/request-with-info';
import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import * as dayjs from 'dayjs';
import { Response } from 'express';
import { memoryStorage } from 'multer';
import { DataSource } from 'typeorm';
import { dataHubCaller } from '../../common/data-hub-caller.util';
import { DH_PERMISSIONS } from '../../common/data-hub-permission-codes';
import { DataHubPermissionGuard, RequireDataHubPermission } from '../../common/data-hub-permission.guard';
import { DataServiceImportQueryDto, DataServiceImportTemplateQueryDto } from './dto/data-service-import-query.dto';
import { DataServiceImportTemplateService } from './data-service-import-template.service';
import { DataServiceImportService } from './data-service-import.service';
import { IMPORT_LIMITS } from './data-service-import-sheet-columns';

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Own base path: under /data-services the `:id` routes would capture "import".
@Controller('v1/data-hub/data-service-imports')
@ApiTags('data-hub-data-service-imports')
@ApiBearerAuth()
@UseGuards(BearerGuard, DataHubPermissionGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class DataServiceImportController {
  constructor(
    private readonly templateService: DataServiceImportTemplateService,
    private readonly importService: DataServiceImportService,
    private readonly dataSource: DataSource,
  ) {}

  @ApiOperation({ summary: 'Download the bulk-import template (DANH_MUC filled from current data)' })
  @Get('template')
  @RequireDataHubPermission(DH_PERMISSIONS.DATA_SERVICE_CREATE)
  async template(@Query() q: DataServiceImportTemplateQueryDto, @Req() req: RequestWithInfo, @Res() res: Response) {
    const caller = dataHubCaller(req);
    let example: { email: string } | undefined;
    if (q.example) {
      const rows: Array<{ email: string | null }> = await this.dataSource.query(
        'SELECT email FROM users WHERE id = $1',
        [caller.id],
      );
      example = { email: rows[0]?.email ?? '' };
    }
    const buffer = await this.templateService.build(example);
    const name = `${q.example ? 'mau-import-dich-vu' : 'template-import-dich-vu'}_${dayjs().format('DD-MM-YYYY')}.xlsx`;
    res.setHeader('Content-Type', XLSX_TYPE);
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.send(buffer);
  }

  @ApiOperation({
    summary: 'Check (dry_run=true, default) or import (dry_run=false) data services from the template',
    description:
      'Returns a summary, every issue by cell, and the uploaded file annotated with result columns (base64).',
  })
  @Post()
  @RequireDataHubPermission(DH_PERMISSIONS.DATA_SERVICE_CREATE)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } },
  })
  @UseInterceptors(
    FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: IMPORT_LIMITS.FILE_BYTES } }),
  )
  async import(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query() q: DataServiceImportQueryDto,
    @Req() req: RequestWithInfo,
  ) {
    const caller = dataHubCaller(req);
    // .xlsx is a zip: it starts with "PK".
    if (!file?.buffer || file.buffer.length < 4 || file.buffer.toString('latin1', 0, 2) !== 'PK') {
      throw new BadRequestException('INVALID_FILE: cần file .xlsx theo template');
    }
    return this.importService.import(file.buffer, q.dry_run, caller);
  }
}
