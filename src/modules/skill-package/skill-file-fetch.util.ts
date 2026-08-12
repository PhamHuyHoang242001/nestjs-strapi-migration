import { BadGatewayException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { promises as fsp } from 'fs';
import * as path from 'path';
import { STRAPI_UPLOAD_URL } from '@configuration/env.config';

// Pull-based upload: the client uploads the file to Strapi first and sends us the resulting
// URL. Strapi and this service share the same `public/uploads` directory (shared volume), so
// we read the zip bytes straight off local disk — NOT over HTTP. A direct HTTP GET to Strapi's
// /uploads/*.zip is blocked by its preventAccessFile static-route guard; a filesystem read
// bypasses that guard entirely, the same way the transform-file controller streams local files.
const ZIP_MAX_BYTES = 20 * 1024 * 1024; // 20 MB — mirrors the previous multipart cap.

// Local directory the app serves static uploads from (mirrors transform-file.controller).
const PUBLIC_DIR = path.resolve(process.cwd(), 'public');

// Normalised result of a fetched file; shaped to populate the zip file row directly.
export interface FetchedFile {
  buffer: Buffer;
  mimeType: string;
  size: number; // bytes, measured from the actual file on disk (never client-supplied)
  filename: string; // decoded basename parsed from the URL path
  originalName: string; // decoded basename
  path: string; // source URL as-sent (stored as file_url)
}

@Injectable()
export class SkillFileFetchService {
  // Resolve a Strapi file URL to an on-disk path under the shared public/ directory.
  // Accepts a full URL (http://host/uploads/x.zip) or a root-relative path (/uploads/x.zip);
  // only the pathname is used. Path-traversal guard (identical to streamLocalFile) ensures the
  // resolved path cannot escape public/ — e.g. "/uploads/../../etc/passwd" is rejected.
  private resolveLocalPath(url: string): string {
    let pathname: string;
    try {
      pathname = new URL(url).pathname; // absolute URL → take its path component
    } catch {
      pathname = url; // already a root-relative path
    }

    const relativePath = pathname.replace(/^\/+/, '');
    const filePath = path.resolve(PUBLIC_DIR, relativePath);
    const relativeFromPublic = path.relative(PUBLIC_DIR, filePath);
    if (relativeFromPublic.startsWith('..') || path.isAbsolute(relativeFromPublic)) {
      throw new UnprocessableEntityException('URL_NOT_ALLOWED: file path escapes the public directory');
    }
    return filePath;
  }

  // Read the zip bytes from the local shared upload directory, enforcing the size cap.
  // Mirrors the transform-file controller's local-file read so Strapi's static-route guard
  // (preventAccessFile) is never involved.
  async downloadZip(url: string): Promise<FetchedFile> {
    const filePath = this.resolveLocalPath(url);

    // Stat first so an oversized file is rejected before it is loaded into memory.
    let size: number;
    try {
      const stat = await fsp.stat(filePath);
      if (!stat.isFile()) throw new Error('not a regular file');
      size = stat.size;
    } catch {
      throw new UnprocessableEntityException('FILE_NOT_FOUND: file does not exist in the upload directory');
    }

    if (size > ZIP_MAX_BYTES) {
      throw new UnprocessableEntityException(`FILE_TOO_LARGE: file ${size} bytes exceeds ${ZIP_MAX_BYTES}`);
    }

    let buffer: Buffer;
    try {
      buffer = await fsp.readFile(filePath);
    } catch (err: unknown) {
      // A read failure after a successful stat (permissions, race deletion) surfaces as 502 so
      // the client gets a clear upstream-read signal rather than an opaque 500.
      const msg = err instanceof Error ? err.message : 'unknown read error';
      throw new BadGatewayException(`Failed to read file from disk: ${msg}`);
    }

    const rawName = path.basename(filePath) || 'skill.zip';
    const filename = decodeURIComponent(rawName);
    return {
      buffer,
      // The skill file is always a zip archive; no need to sniff the extension.
      mimeType: 'application/zip',
      size: buffer.length,
      filename,
      originalName: filename,
      path: url,
    };
  }

  // Resolve a possibly-relative Strapi URL to absolute against the configured base.
  private toAbsolute(url: string): string {
    try {
      return new URL(url, STRAPI_UPLOAD_URL).toString();
    } catch {
      throw new UnprocessableEntityException('INVALID_URL: file url is malformed');
    }
  }

  // Origin guard: the resolved URL MUST share the configured Strapi origin. Kept for the avatar
  // URL, which is stored as-sent and served back to the client verbatim (by URL, not read from
  // disk) — so it must still originate from the configured Strapi host.
  private assertAllowedOrigin(absoluteUrl: string): URL {
    const parsed = new URL(absoluteUrl);
    const base = new URL(STRAPI_UPLOAD_URL);
    if (parsed.origin !== base.origin) {
      throw new UnprocessableEntityException(`URL_NOT_ALLOWED: file url must originate from ${base.origin}`);
    }
    return parsed;
  }

  // Validate a Strapi URL WITHOUT reading any bytes. Used for the avatar URL, which is stored
  // as-sent and only ever served back by URL — but must still originate from the configured
  // Strapi host so a client cannot make us persist an arbitrary URL. Throws 422 on a malformed
  // or foreign-origin URL.
  assertStrapiUrl(url: string): void {
    const absolute = this.toAbsolute(url);
    this.assertAllowedOrigin(absolute);
  }
}
