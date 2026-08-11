import { BadGatewayException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import axios from 'axios';
import { STRAPI_UPLOAD_TOKEN, STRAPI_UPLOAD_URL } from '@configuration/env.config';

// Pull-based upload: the client uploads the file to Strapi first and sends us the
// resulting URL. We fetch the bytes from that URL to unzip/validate, and store the
// URL as media.path. This service performs the fetch with two mandatory guards.
const ZIP_MAX_BYTES = 20 * 1024 * 1024; // 20 MB — mirrors the previous multipart cap.

// Normalised result of a fetched file; shaped to populate a Media row directly.
export interface FetchedFile {
  buffer: Buffer;
  mimeType: string;
  size: number; // bytes, measured from the actual download (never client-supplied)
  filename: string; // basename parsed from the URL path
  originalName: string; // decoded basename
  path: string; // absolute source URL (stored as media.path)
}

@Injectable()
export class SkillFileFetchService {
  // Resolve a possibly-relative Strapi URL to absolute against the configured base.
  private toAbsolute(url: string): string {
    try {
      return new URL(url, STRAPI_UPLOAD_URL).toString();
    } catch {
      throw new UnprocessableEntityException('INVALID_URL: file url is malformed');
    }
  }

  // SSRF guard: the resolved URL MUST share the configured Strapi origin. Without
  // this, a client could make the backend fetch arbitrary internal endpoints.
  private assertAllowedOrigin(absoluteUrl: string): URL {
    const parsed = new URL(absoluteUrl);
    const base = new URL(STRAPI_UPLOAD_URL);
    if (parsed.origin !== base.origin) {
      throw new UnprocessableEntityException(`URL_NOT_ALLOWED: file url must originate from ${base.origin}`);
    }
    return parsed;
  }

  // Download the zip bytes from a Strapi URL, enforcing origin + size caps.
  async downloadZip(url: string): Promise<FetchedFile> {
    const absolute = this.toAbsolute(url);
    const parsed = this.assertAllowedOrigin(absolute);

    let response;
    try {
      response = await axios.get<ArrayBuffer>(absolute, {
        responseType: 'arraybuffer',
        timeout: 30_000,
        // Reject oversized payloads at the transport layer (zip-bomb / abuse guard).
        maxContentLength: ZIP_MAX_BYTES,
        maxBodyLength: ZIP_MAX_BYTES,
        headers: STRAPI_UPLOAD_TOKEN ? { Authorization: `Bearer ${STRAPI_UPLOAD_TOKEN}` } : {},
      });
    } catch (err: unknown) {
      // Any connectivity / non-2xx / oversize failure surfaces as 502 so the client
      // gets a clear upstream-fetch signal rather than an opaque 500.
      const msg = err instanceof Error ? err.message : String(err);
      throw new BadGatewayException(`Failed to download file from Strapi: ${msg}`);
    }

    const buffer = Buffer.from(response.data);
    if (buffer.length > ZIP_MAX_BYTES) {
      throw new UnprocessableEntityException(
        `FILE_TOO_LARGE: downloaded ${buffer.length} bytes exceeds ${ZIP_MAX_BYTES}`,
      );
    }

    const rawName = parsed.pathname.split('/').pop() || 'skill.zip';
    const filename = decodeURIComponent(rawName);
    return {
      buffer,
      mimeType: (response.headers['content-type'] as string) || 'application/zip',
      size: buffer.length,
      filename,
      originalName: filename,
      path: absolute,
    };
  }

  // Validate a Strapi URL WITHOUT downloading its bytes. Used for the avatar URL, which
  // is stored as-sent and only ever served back by URL — but must still originate from the
  // configured Strapi host (SSRF guard) so a client cannot make us persist an arbitrary URL.
  // Throws 422 on a malformed or foreign-origin URL.
  assertStrapiUrl(url: string): void {
    const absolute = this.toAbsolute(url);
    this.assertAllowedOrigin(absolute);
  }
}
