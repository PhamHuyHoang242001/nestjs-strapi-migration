/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, Logger } from '@nestjs/common';
import { UploadFileDto } from './dto/upload-file.dto';
import { MediaRepository } from './repository/media.repository';
import { File as MulterFile } from 'multer';
import { RequestInfo } from '@common/types/request-with-info';
import * as fs from 'fs';
import * as path from 'path';

/** Multer disk-storage file has a `path` property added at runtime */
interface DiskFile extends MulterFile {
  path?: string;
}

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);
  constructor(private readonly mediaRepository: MediaRepository) {}

  uploadFileGGC(uploadFile: UploadFileDto) {
    const { filename, content_type } = uploadFile;
    return { filename, content_type };
  }

  async saveAndCreateMedia(file: MulterFile, info: RequestInfo) {
    if (!file) return null;
    const uploadsDir = path.resolve('./public/uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

    const diskFile = file as DiskFile;
    const diskPath = diskFile.path ? String(diskFile.path) : null;
    const absolutePath = diskPath ? path.resolve(diskPath) : path.resolve(uploadsDir, file.filename);

    const webPath = `/${path.relative(path.resolve('./'), absolutePath).replace(/\\/g, '/')}`;

    if (!fs.existsSync(absolutePath)) {
      this.logger.warn(`uploaded file not found on disk at ${absolutePath}`);
    }

    const payload: Partial<import('@modules/databases/media.entity').Media> = {
      filename: file.filename,
      original_name: file.originalname,
      mime_type: file.mimetype,
      size: file.size,
      path: webPath,
      uploader_id: (info?.user?.id as number | undefined) ?? undefined,
      uploader_type: info?.client ?? undefined,
      upload_type: 'local',
    };

    const media = await this.mediaRepository.createMedia(payload);
    return media;
  }

  async saveManyAndCreateMedia(files: MulterFile[], info: RequestInfo): Promise<unknown[]> {
    if (!files || files.length === 0) return [];
    const results: unknown[] = [];
    for (const file of files) {
      try {
        const media = await this.saveAndCreateMedia(file, info);
        results.push(media);
      } catch (err) {
        this.logger.error('failed save file', err);
      }
    }
    return results;
  }

  async findOne(id: number) {
    return this.mediaRepository.findOneById(id);
  }
}
