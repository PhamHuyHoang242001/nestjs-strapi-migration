import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { STRAPI_UPLOAD_URL } from '@configuration/env.config';

// Avatar-only SSRF guard for the API Catalog. Unlike the Skill Package there is NO ZIP fetch
// and NO local-disk read here — the prompt artifact is plain text sent inline in the JSON body.
// The only externally-referenced asset is the avatar URL, which the client uploads to Strapi
// first and sends back. It is stored as-sent and served to the client verbatim (by URL, never
// read from disk), so it must still originate from the configured Strapi host — otherwise a
// client could make us persist an arbitrary URL.
@Injectable()
export class ApiAvatarUrlService {
  // Resolve a possibly-relative Strapi URL to absolute against the configured base.
  private toAbsolute(url: string): string {
    try {
      return new URL(url, STRAPI_UPLOAD_URL).toString();
    } catch {
      throw new UnprocessableEntityException('INVALID_URL: avatar url is malformed');
    }
  }

  // Origin guard: the resolved URL MUST share the configured Strapi origin.
  private assertAllowedOrigin(absoluteUrl: string): void {
    const parsed = new URL(absoluteUrl);
    const base = new URL(STRAPI_UPLOAD_URL);
    if (parsed.origin !== base.origin) {
      throw new UnprocessableEntityException(`URL_NOT_ALLOWED: avatar url must originate from ${base.origin}`);
    }
  }

  // Validate a Strapi avatar URL WITHOUT reading any bytes. Throws 422 on a malformed or
  // foreign-origin URL.
  assertStrapiUrl(url: string): void {
    const absolute = this.toAbsolute(url);
    this.assertAllowedOrigin(absolute);
  }
}
