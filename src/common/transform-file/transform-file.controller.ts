import { IsMaintenanceGuard } from '@common/guards';
import { RequestWithInfo } from '@common/types/request-with-info';
import { Controller, Get, NotFoundException, Param, Query, Req, Res, UseFilters, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import * as fs from 'fs';
import * as mime from 'mime-types';
import * as path from 'path';
import { isExternalTransformFile } from './transform-file-link.helper';
import { TransformFileAuthGuard } from './transform-file-auth.guard';
import { TransformFileAuthRedirectFilter } from './transform-file-auth-redirect.filter';
import { TransformFileService } from './transform-file.service';

const DOWNLOAD_EXTENSIONS = new Set([
  '.csv',
  '.doc',
  '.docx',
  '.ppt',
  '.pptx',
  '.rar',
  '.xls',
  '.xlsx',
  '.zip',
]);

// Extensions the browser can render natively; served inline so the FE views them
// in-page and downloads via the viewer's own controls instead of forcing a download.
const INLINE_EXTENSIONS = new Set(['.pdf']);

@Controller()
@ApiTags('transform-file')
@ApiBearerAuth()
@UseGuards(TransformFileAuthGuard, IsMaintenanceGuard)
@UseFilters(TransformFileAuthRedirectFilter)
export class TransformFileController {
  constructor(private readonly service: TransformFileService) {}

  @ApiOperation({ summary: 'Transform user file URL' })
  @Get('media/transform-file/:id')
  async transformUser(
    @Param('id') id: string,
    @Query() query: Record<string, string>,
    @Req() req: RequestWithInfo,
    @Res() res: Response,
  ) {
    await this.transform(Number(id), query, req, res);
  }

  @ApiOperation({ summary: 'Transform admin file URL' })
  @Get('admin/media/transform-file/:id')
  async transformAdmin(
    @Param('id') id: string,
    @Query() query: Record<string, string>,
    @Req() req: RequestWithInfo,
    @Res() res: Response,
  ) {
    await this.transform(Number(id), query, req, res);
  }

  private async transform(id: number, query: Record<string, string>, req: RequestWithInfo, res: Response) {
    const result = await this.service.transform({
      id,
      model: query.model,
      reportCode: query.report_code,
      info: req.info,
    });

    if (isExternalTransformFile(result.type)) {
      return res.redirect(result.url);
    }

    this.streamLocalFile(result.url, res);
  }

  private streamLocalFile(fileUrl: string, res: Response) {
    const publicDir = path.resolve(process.cwd(), 'public');
    const relativePath = fileUrl.replace(/^\/+/, '');
    const filePath = path.resolve(publicDir, relativePath);
    const relativeFromPublic = path.relative(publicDir, filePath);

    if (relativeFromPublic.startsWith('..') || path.isAbsolute(relativeFromPublic)) {
      throw new NotFoundException('File not found');
    }
    if (!fs.existsSync(filePath)) throw new NotFoundException('File not found');

    const contentType = mime.lookup(filePath) || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);

    const fileName = path.basename(filePath);
    const extension = path.extname(filePath).toLowerCase();
    if (INLINE_EXTENSIONS.has(extension)) {
      res.setHeader('Content-Disposition', `inline; filename=${encodeURIComponent(fileName)}`);
    } else if (DOWNLOAD_EXTENSIONS.has(extension)) {
      res.setHeader('Content-Disposition', `attachment; filename=${encodeURIComponent(fileName)}`);
    }

    fs.createReadStream(filePath).pipe(res);
  }
}
