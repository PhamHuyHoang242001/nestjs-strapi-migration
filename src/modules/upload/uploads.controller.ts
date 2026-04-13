import {
  Controller,
  Post,
  Body,
  UseInterceptors,
  FileTypeValidator,
  MaxFileSizeValidator,
  ParseFilePipe,
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
import { Request } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { BearerGuard } from '@common/guards';
import { IsAdminGuard } from '@common/guards/is-admin.guard';
import { File as MulterFile } from 'multer';

@ApiTags('Uploads')
@Controller('v1/uploads')
export class UploadsController {
  constructor(
    private readonly uploadsService: UploadsService,
  ) { }

  @Post('/upload-google')
  @ApiOperation({ summary: 'Get presigned URL for upload post image' })
  async getSignedUrlForUpload(@Body() uploadFile: UploadFileDto): Promise<any> {
    return await this.uploadsService.uploadFileGGC(uploadFile);
  }

  @Post('/one')
  @UseGuards(BearerGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          // save under ./public/uploads
          const uploadsDir = path.resolve('./public/uploads');
          if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
          cb(null, uploadsDir);
        },
        filename: (req, file, cb) => {
          const timestamp = Date.now();
          const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
          cb(null, `${timestamp}-${Math.round(Math.random() * 1e9)}-${safeName}`);
        },
      }),
    }),
  )
  async uploadOne(@UploadedFile() file: MulterFile, @Req() req: Request): Promise<any> {
    return this.uploadsService.saveAndCreateMedia(file, (req as any).info || {});
  }

  @Post('/many')
  @UseGuards(BearerGuard)
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const uploadsDir = path.resolve('./public/uploads');
          if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
          cb(null, uploadsDir);
        },
        filename: (req, file, cb) => {
          const timestamp = Date.now();
          const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
          cb(null, `${timestamp}-${Math.round(Math.random() * 1e9)}-${safeName}`);
        },
      }),
    }),
  )
  async uploadMany(@UploadedFiles() files: MulterFile[], @Req() req: Request): Promise<any> {
    return this.uploadsService.saveManyAndCreateMedia(files || [], (req as any).info || {});
  }

  @Get('/:id')
  @UseGuards(BearerGuard)
  async getOne(@Param('id') id: string, @Req() req: Request): Promise<any> {
    const media = await this.uploadsService.findOne(Number(id));
    if (!media) return null;
    // build a full url for the file based on request host
    const host = req.get('host');
    const protocol = req.protocol;
    const filePath = media.path?.startsWith('/') ? media.path : `/${media.path}`;
    const url = `${protocol}://${host}${filePath}`;
    return { ...media, url };
  }

}
