import { BadRequestException } from '@nestjs/common';

export const ALLOWED_COWORKER_LINK_ORIGINS = ['https://teams.microsoft.com'] as const;

export function assertCoworkerLink(link: string): string {
  let parsed: URL;
  try {
    parsed = new URL(link);
  } catch {
    throw new BadRequestException('INVALID_COWORKER_LINK: must be an absolute URL');
  }
  if (!ALLOWED_COWORKER_LINK_ORIGINS.includes(parsed.origin as (typeof ALLOWED_COWORKER_LINK_ORIGINS)[number])) {
    throw new BadRequestException('INVALID_COWORKER_LINK: origin is not allowed');
  }
  return link;
}
