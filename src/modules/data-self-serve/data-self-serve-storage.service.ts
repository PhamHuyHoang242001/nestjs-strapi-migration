import { AWS_BUCKET, AWS_REGION } from '@configuration/env.config';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Response } from 'express';
import * as fs from 'fs';
import * as mime from 'mime-types';
import * as path from 'path';
import { Readable } from 'stream';
import { normalizeFileName } from './data-self-serve-format.helper';

@Injectable()
export class DataSelfServeStorageService {
  private readonly s3Client = new S3Client({ region: AWS_REGION });

  async streamFile(storagePath: string, fileName: string, res: Response) {
    if (!storagePath) throw new NotFoundException('File not found');
    if (this.isLocalPath(storagePath)) return this.streamLocalFile(storagePath, fileName, res);
    return this.streamS3File(storagePath, fileName, res);
  }

  private async streamS3File(storagePath: string, fileName: string, res: Response) {
    if (!AWS_BUCKET) throw new NotFoundException('S3 bucket is not configured');
    const key = storagePath.replace(/^s3:\/\//, '').replace(new RegExp(`^${AWS_BUCKET}/`), '');
    const result = await this.s3Client.send(new GetObjectCommand({ Bucket: AWS_BUCKET, Key: key }));
    const body = result.Body as Readable | undefined;
    if (!body) throw new NotFoundException('File not found');
    res.setHeader('Content-Type', result.ContentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${normalizeFileName(fileName)}"`);
    body.pipe(res);
  }

  private streamLocalFile(storagePath: string, fileName: string, res: Response) {
    const publicDir = path.resolve(process.cwd(), 'public');
    const filePath = path.resolve(publicDir, storagePath.replace(/^\/?public\/?/, '').replace(/^\/+/, ''));
    const relative = path.relative(publicDir, filePath);
    if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(filePath)) {
      throw new NotFoundException('File not found');
    }
    res.setHeader('Content-Type', mime.lookup(filePath) || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${normalizeFileName(fileName)}"`);
    fs.createReadStream(filePath).pipe(res);
  }

  private isLocalPath(storagePath: string) {
    return storagePath.startsWith('/') || storagePath.startsWith('public/');
  }
}
