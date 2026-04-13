import { Injectable, Logger } from '@nestjs/common';
import { UploadFileDto } from './dto/upload-file.dto';
import { MediaRepository } from './repository/media.repository';
import { File as MulterFile } from 'multer';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);
  constructor(
    private readonly mediaRepository: MediaRepository,
  ) { }

  async uploadFileGGC(uploadFile: UploadFileDto) {
    const { filename, content_type } = uploadFile;
    // existing placeholder behaviour preserved
    return { filename, content_type };
  }

  async saveAndCreateMedia(file: MulterFile, info: any) {
    if (!file) return null;
    // ensure directory exists
    const uploadsDir = path.resolve('./public/uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

    // prefer the path provided by multer (absolute), fall back to our constructed path
    const absolutePath = (file as any).path
      ? path.resolve((file as any).path)
      : path.resolve(uploadsDir, file.filename);

    const webPath = `/${path.relative(path.resolve('./'), absolutePath).replace(/\\/g, '/')}`;

    if (!fs.existsSync(absolutePath)) {
      this.logger.warn(`uploaded file not found on disk at ${absolutePath}`);
    }

    const payload: any = {
      filename: file.filename,
      original_name: file.originalname,
      mime_type: file.mimetype,
      size: file.size,
      // path stored as a web-accessible path (e.g. /public/uploads/xxx)
      path: webPath,
      uploader_id: info?.user?.id ?? null,
      uploader_type: info?.client ?? null,
      upload_type: 'local',
    };

    const media = await this.mediaRepository.createMedia(payload as any);
    return media;
  }

  async saveManyAndCreateMedia(files: MulterFile[], info: any) {
    if (!files || files.length === 0) return [];
    const results = [];
    for (const file of files) {
      try {
        // directory should already exist from diskStorage but ensure anyway
        const media = await this.saveAndCreateMedia(file, info);
        results.push(media);
      } catch (err) {
        this.logger.error('failed save file', err as any);
      }
    }
    return results;
  }

  async findOne(id: number) {
    return this.mediaRepository.findOneById(id);
  }
}
