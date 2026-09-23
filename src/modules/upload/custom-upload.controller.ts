import { isArchiveContentAllowed } from '@common/archive-scan';
import { BearerGuard } from '@common/guards';
import { RequestWithInfo } from '@common/types/request-with-info';
import { Media } from '@modules/databases/media.entity';
import { BadRequestException, Controller, Post, Req, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import * as crypto from 'crypto';
import * as fs from 'fs';
import { diskStorage } from 'multer';
import * as os from 'os';
import * as path from 'path';
import { CustomUploadService, UploadedDiskFile } from './custom-upload.service';

/**
 * Uploads land here first, NOT in public/uploads. `public/` is served statically without a
 * guard, so writing straight to it would expose a file during the window between multer
 * writing it and the scan rejecting it.
 */
const TEMP_UPLOAD_DIR = path.join(os.tmpdir(), 'custom-upload');

/**
 * Hard ceiling per file. The proxy is expected to cap the request body too, but that lives
 * outside this repo — without a limit here a single request can fill the disk and OOM the
 * process, since every scanner reads the whole archive into memory.
 */
const MAX_FILE_SIZE_BYTES = Number(process.env.UPLOAD_MAX_FILE_SIZE ?? 256 * 1024 * 1024);

const tempStorage = diskStorage({
  destination: (_req, _file, cb) => {
    // 0o700: the path is predictable, so on a shared host anyone could otherwise pre-create
    // it as a symlink or read uploads before they are scanned.
    fs.mkdirSync(TEMP_UPLOAD_DIR, { recursive: true, mode: 0o700 });
    cb(null, TEMP_UPLOAD_DIR);
  },
  // Opaque name while in temp; the human-readable one is applied on the move to public.
  filename: (_req, _file, cb) => cb(null, crypto.randomUUID()),
});

@ApiTags('Custom Upload')
@Controller('v1')
export class CustomUploadController {
  constructor(private readonly customUploadService: CustomUploadService) {}

  /**
   * Port of Strapi's `POST /custom-upload`. Field name, multi-file support and the archive
   * content scan all match the original; `folderId` is dropped since media has no folders.
   */
  @Post('custom-upload')
  @UseGuards(BearerGuard)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload one or more files (archives are scanned for disallowed content)' })
  // ApiConsumes alone leaves Swagger with no body schema, so the UI renders no file picker.
  // The field name must stay `files` — that is what the Strapi endpoint accepted and what
  // EDA_FE sends (appDetail.tsx:55).
  @ApiBody({
    schema: {
      type: 'object',
      required: ['files'],
      properties: {
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          description: 'One or more files. Repeat the field to send several in one request.',
        },
      },
    },
  })
  // No maxCount — Strapi did not cap the file count either — but each file is size-capped.
  @UseInterceptors(
    FilesInterceptor('files', undefined, { storage: tempStorage, limits: { fileSize: MAX_FILE_SIZE_BYTES } }),
  )
  async customFileUpload(@UploadedFiles() files: UploadedDiskFile[], @Req() req: RequestWithInfo): Promise<Media[]> {
    const uploaded = files ?? [];
    if (uploaded.length === 0) {
      throw new BadRequestException('INVALID_DATA: no file uploaded');
    }

    try {
      // Only archives are inspected; a plain file passes untouched, as in Strapi.
      if (!(await isArchiveContentAllowed(uploaded))) {
        throw new BadRequestException('FILE_NOT_ALLOWED: archive contains a disallowed file type');
      }

      return await this.customUploadService.moveAndCreateMedia(uploaded, req.info ?? {});
    } finally {
      // Successful files were renamed out of temp already, so this only sweeps leftovers
      // from a rejected batch or a mid-loop failure.
      await this.customUploadService.cleanupTempFiles(uploaded);
    }
  }
}
