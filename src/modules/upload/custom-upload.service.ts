import { RequestInfo } from '@common/types/request-with-info';
import { Media } from '@modules/databases/media.entity';
import { Injectable, Logger } from '@nestjs/common';
import * as fsp from 'fs/promises';
import * as mime from 'mime-types';
import * as path from 'path';
import { buildStoredFileName, StoredFileName } from './custom-upload-filename.util';
import { MediaRepository } from './repository/media.repository';

/** Multer disk-storage file: `path` points at the temp file multer just wrote. */
export interface UploadedDiskFile {
  path: string;
  originalname: string;
  mimetype: string;
  size: number;
}

/** Where files are served from; must stay in step with `useStaticAssets(public)` in main.ts. */
export const UPLOAD_DIR = path.resolve('./public/uploads');
const PUBLIC_URL_PREFIX = '/uploads';

/** Strapi records file sizes in kilobytes with 2 decimals; this keeps that unit. */
export function bytesToKbytes(bytes: number): number {
  return Math.round((bytes / 1000) * 100) / 100;
}

@Injectable()
export class CustomUploadService {
  private readonly logger = new Logger(CustomUploadService.name);

  /** `uploadDir` is injectable so specs can write to a scratch dir instead of public/. */
  constructor(
    private readonly mediaRepository: MediaRepository,
    private readonly uploadDir: string = UPLOAD_DIR,
  ) {}

  /**
   * Moves already-scanned temp files into the public upload dir and records one media row each.
   * Callers must scan BEFORE calling this — nothing here inspects archive contents.
   */
  async moveAndCreateMedia(files: UploadedDiskFile[], info: RequestInfo): Promise<Media[]> {
    await fsp.mkdir(this.uploadDir, { recursive: true });

    const created: Media[] = [];
    const published: string[] = [];
    try {
      for (const file of files) {
        // Record the destination the moment the bytes land, not after the row is saved —
        // otherwise a failing save() leaves its own file behind, unrolled back.
        const stored = buildStoredFileName(file.originalname);
        const destination = path.join(this.uploadDir, stored.fileName);
        await this.moveFile(file.path, destination);
        published.push(destination);

        created.push(await this.createMediaRow(file, stored, info));
      }
      return created;
    } catch (err) {
      // Without this, a failure on file 3 leaves files 1-2 sitting in the public directory
      // with no response handle and, when the DB insert was the thing that failed, no row
      // pointing at them either.
      await Promise.all(published.map((file) => fsp.unlink(file).catch(() => undefined)));
      throw err;
    }
  }

  private createMediaRow(file: UploadedDiskFile, stored: StoredFileName, info: RequestInfo): Promise<Media> {
    const { hash, ext, fileName } = stored;
    const userId = typeof info?.user?.id === 'number' ? info.user.id : null;

    return this.mediaRepository.save(
      this.mediaRepository.create({
        name: file.originalname,
        hash,
        ext,
        // The client-declared mimetype is untrusted; fall back to the extension when it is
        // missing or generic, matching what Strapi's provider layer resolved.
        mime: this.resolveMime(file, ext),
        // Strapi's files.size is kilobytes rounded to 2 decimals, not bytes. This table
        // mirrors that schema, so keep the same unit or rows written here will read 1024x
        // larger than rows migrated from Strapi.
        size: bytesToKbytes(file.size),
        url: `${PUBLIC_URL_PREFIX}/${fileName}`,
        provider: 'local',
        created_by_id: userId,
        updated_by_id: userId,
      }),
    );
  }

  private resolveMime(file: UploadedDiskFile, ext: string): string {
    if (file.mimetype && file.mimetype !== 'application/octet-stream') return file.mimetype;
    return mime.lookup(ext) || file.mimetype || 'application/octet-stream';
  }

  /**
   * `rename` fails with EXDEV when the temp dir and the upload dir sit on different
   * filesystems — routine inside containers where /tmp and the data volume differ.
   */
  private async moveFile(from: string, to: string): Promise<void> {
    try {
      await fsp.rename(from, to);
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code !== 'EXDEV') throw err;
      // Copy to a sibling temp name first: copying straight onto the final path would let the
      // static handler serve a half-written file.
      const staging = `${to}.part`;
      await fsp.copyFile(from, staging);
      await fsp.rename(staging, to);
      await fsp.unlink(from).catch(() => undefined);
    }
  }

  /** Best-effort temp cleanup; never throws, so it is safe inside a finally block. */
  async cleanupTempFiles(files: UploadedDiskFile[]): Promise<void> {
    await Promise.all(
      files.map((file) =>
        fsp.unlink(file.path).catch((err: NodeJS.ErrnoException) => {
          if (err?.code !== 'ENOENT') this.logger.warn(`failed to remove temp file ${file.path}: ${err?.message}`);
        }),
      ),
    );
  }
}
