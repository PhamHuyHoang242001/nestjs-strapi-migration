/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Controller,
  Post,
  Body,
  UseInterceptors,
  UploadedFiles,
  UseGuards,
  UploadedFile,
  Get,
  Param,
  Req,
} from '@nestjs/common';
import { UploadsService } from './uploads.service';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UploadFileDto } from './dto/upload-file.dto';
import { FilesInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import { BearerGuard } from '@common/guards';
import { File as MulterFile } from 'multer';
import { RequestWithInfo } from '@common/types/request-with-info';

@ApiTags('Uploads')
@Controller('v1/uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post('/upload-google')
  @ApiOperation({ summary: 'Get presigned URL for upload post image' })
  getSignedUrlForUpload(@Body() uploadFile: UploadFileDto) {
    return this.uploadsService.uploadFileGGC(uploadFile);
  }

  @Post('/one')
  @UseGuards(BearerGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const uploadsDir = path.resolve('./public/uploads');
          if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
          cb(null, uploadsDir);
        },
        filename: (_req, file, cb) => {
          const timestamp = Date.now();
          const safeName = (file.originalname as string).replace(/[^a-zA-Z0-9.\-_]/g, '_');
          cb(null, `${timestamp}-${Math.round(Math.random() * 1e9)}-${safeName}`);
        },
      }),
    }),
  )
  async uploadOne(@UploadedFile() file: MulterFile, @Req() req: RequestWithInfo) {
    return this.uploadsService.saveAndCreateMedia(file, req.info ?? {});
  }

  @Post('/many')
  @UseGuards(BearerGuard)
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const uploadsDir = path.resolve('./public/uploads');
          if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
          cb(null, uploadsDir);
        },
        filename: (_req, file, cb) => {
          const timestamp = Date.now();
          const safeName = (file.originalname as string).replace(/[^a-zA-Z0-9.\-_]/g, '_');
          cb(null, `${timestamp}-${Math.round(Math.random() * 1e9)}-${safeName}`);
        },
      }),
    }),
  )
  async uploadMany(@UploadedFiles() files: MulterFile[], @Req() req: RequestWithInfo) {
    return this.uploadsService.saveManyAndCreateMedia(files ?? [], req.info ?? {});
  }

  @Get('/:id')
  @UseGuards(BearerGuard)
  async getOne(@Param('id') id: string, @Req() req: RequestWithInfo) {
    const media = await this.uploadsService.findOne(Number(id));
    if (!media) return null;
    const host = req.get('host');
    const protocol = req.protocol;
    const filePath = media.path?.startsWith('/') ? media.path : `/${media.path ?? ''}`;
    const url = `${protocol}://${host ?? ''}${filePath}`;
    return { ...media, url };
  }
}
