import { BearerGuard } from '@common/guards/bearer.guard';
import { RequestWithInfo } from '@common/types/request-with-info';
import {
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { DataSource } from 'typeorm';
import { dataHubCaller } from '../common/data-hub-caller.util';
import { DH_PERMISSIONS } from '../common/data-hub-permission-codes';
import { DataHubPermissionGuard, RequireDataHubPermission } from '../common/data-hub-permission.guard';
import { ImportQueryDto, ImportTemplateQueryDto } from './import-dto';
import { callerEmail, ImportUpload, sendTemplate, xlsxUpload } from './import-helpers.util';
import { ServiceImportKind } from './import-layouts';
import { SourceTableImportService } from './import-source-tables.service';
import {
  ConsumerImportTemplateService,
  DataServiceImportTemplateService,
  LogicalTermImportTemplateService,
  SourceTableImportTemplateService,
} from './import-templates.service';
import { ConsumerImportService, DataServiceImportService, LogicalTermImportService } from './import.service';

// Own base path: under /consumers the `:id` routes would capture "import".
@Controller('v1/data-hub/consumer-imports')
@ApiTags('data-hub-consumer-imports')
@ApiBearerAuth()
@UseGuards(BearerGuard, DataHubPermissionGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class ConsumerImportController {
  constructor(
    private readonly templateService: ConsumerImportTemplateService,
    private readonly importService: ConsumerImportService,
    private readonly dataSource: DataSource,
  ) {}

  @ApiOperation({ summary: 'Download the App thụ hưởng import template' })
  @Get('template')
  @RequireDataHubPermission(DH_PERMISSIONS.CONSUMER_CREATE)
  async template(@Query() q: ImportTemplateQueryDto, @Req() req: RequestWithInfo, @Res() res: Response) {
    const caller = dataHubCaller(req);
    const example = q.example ? { email: await callerEmail(this.dataSource, caller.id) } : undefined;
    sendTemplate(res, await this.templateService.build(example), 'app-thu-huong', q.example);
  }

  @ApiOperation({ summary: 'Check (dry_run=true, default) or import (dry_run=false) App thụ hưởng' })
  @Post()
  @RequireDataHubPermission(DH_PERMISSIONS.CONSUMER_CREATE)
  @ImportUpload()
  import(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query() q: ImportQueryDto,
    @Req() req: RequestWithInfo,
  ) {
    return this.importService.import(xlsxUpload(file), q.dry_run, dataHubCaller(req));
  }
}

// Own base path: under /logical-terms the `:id` routes would capture "import".
@Controller('v1/data-hub/logical-term-imports')
@ApiTags('data-hub-logical-term-imports')
@ApiBearerAuth()
@UseGuards(BearerGuard, DataHubPermissionGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class LogicalTermImportController {
  constructor(
    private readonly templateService: LogicalTermImportTemplateService,
    private readonly importService: LogicalTermImportService,
  ) {}

  @ApiOperation({ summary: 'Download the Thuật ngữ chuẩn hoá import template' })
  @Get('template')
  @RequireDataHubPermission(DH_PERMISSIONS.LOGICAL_TERM_CREATE)
  async template(@Query() q: ImportTemplateQueryDto, @Res() res: Response) {
    sendTemplate(res, await this.templateService.build(q.example), 'thuat-ngu-chuan-hoa', q.example);
  }

  @ApiOperation({ summary: 'Check (dry_run=true, default) or import (dry_run=false) logical terms' })
  @Post()
  @RequireDataHubPermission(DH_PERMISSIONS.LOGICAL_TERM_CREATE)
  @ImportUpload()
  import(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query() q: ImportQueryDto,
    @Req() req: RequestWithInfo,
  ) {
    return this.importService.import(xlsxUpload(file), q.dry_run, dataHubCaller(req));
  }
}

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

  private async template(kind: ServiceImportKind, q: ImportTemplateQueryDto, req: RequestWithInfo, res: Response) {
    const example = q.example ? { email: await callerEmail(this.dataSource, dataHubCaller(req).id) } : undefined;
    sendTemplate(res, await this.templateService.build(kind, example), `dich-vu-${kind.toLowerCase()}`, q.example);
  }

  @ApiOperation({ summary: 'Download the API data service import template' })
  @Get('api/template')
  @RequireDataHubPermission(DH_PERMISSIONS.DATA_SERVICE_CREATE)
  apiTemplate(@Query() q: ImportTemplateQueryDto, @Req() req: RequestWithInfo, @Res() res: Response) {
    return this.template('API', q, req, res);
  }

  @ApiOperation({ summary: 'Check (dry_run=true, default) or import (dry_run=false) API data services' })
  @Post('api')
  @RequireDataHubPermission(DH_PERMISSIONS.DATA_SERVICE_CREATE)
  @ImportUpload()
  importApi(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query() q: ImportQueryDto,
    @Req() req: RequestWithInfo,
  ) {
    return this.importService.import('API', xlsxUpload(file), q.dry_run, dataHubCaller(req));
  }

  @ApiOperation({ summary: 'Download the SFTP data service import template' })
  @Get('sftp/template')
  @RequireDataHubPermission(DH_PERMISSIONS.DATA_SERVICE_CREATE)
  sftpTemplate(@Query() q: ImportTemplateQueryDto, @Req() req: RequestWithInfo, @Res() res: Response) {
    return this.template('SFTP', q, req, res);
  }

  @ApiOperation({ summary: 'Check (dry_run=true, default) or import (dry_run=false) SFTP data services' })
  @Post('sftp')
  @RequireDataHubPermission(DH_PERMISSIONS.DATA_SERVICE_CREATE)
  @ImportUpload()
  importSftp(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query() q: ImportQueryDto,
    @Req() req: RequestWithInfo,
  ) {
    return this.importService.import('SFTP', xlsxUpload(file), q.dry_run, dataHubCaller(req));
  }
}

// Own base path: under /data-services the `:id` routes would capture "source-table-imports".
@Controller('v1/data-hub/source-table-imports')
@ApiTags('data-hub-source-table-imports')
@ApiBearerAuth()
@UseGuards(BearerGuard, DataHubPermissionGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class SourceTableImportController {
  constructor(
    private readonly templateService: SourceTableImportTemplateService,
    private readonly importService: SourceTableImportService,
  ) {}

  @ApiOperation({ summary: 'Download the source table + physical term import template' })
  @Get('template')
  @RequireDataHubPermission(DH_PERMISSIONS.DATA_SERVICE_UPDATE)
  async template(@Query() q: ImportTemplateQueryDto, @Res() res: Response) {
    sendTemplate(res, await this.templateService.build(q.example), 'bang-nguon-thuat-ngu', q.example);
  }

  @ApiOperation({ summary: 'Check (dry_run=true, default) or import (dry_run=false) source tables and terms' })
  @Post()
  @RequireDataHubPermission(DH_PERMISSIONS.DATA_SERVICE_UPDATE)
  @ImportUpload()
  import(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query() q: ImportQueryDto,
    @Req() req: RequestWithInfo,
  ) {
    return this.importService.import(xlsxUpload(file), q.dry_run, dataHubCaller(req));
  }
}
