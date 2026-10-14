import { BadRequestException } from '@nestjs/common';

// A channel's `domain` column holds its allowed origin(s), comma-separated when the channel has
// several hosts ("https://outlook.office.com,https://outlook.live.com"). Each entry is normalized
// the same way a link's origin is (URL origin: lowercase, punycode host, default port dropped), so
// "https://Teams.Microsoft.com:443/" still matches; empty entries from stray commas are ignored.
export function parseChannelDomains(domain: string | null | undefined): string[] {
  return (domain ?? '')
    .split(',')
    .map((d) => normalizeOrigin(d.trim()))
    .filter(Boolean);
}

function normalizeOrigin(entry: string): string {
  if (!entry) return '';
  try {
    const origin = new URL(entry).origin;
    if (origin !== 'null') return origin;
  } catch {
    // Not a parseable URL: fall back to a plain lowercase compare.
  }
  return entry.toLowerCase().replace(/\/+$/, '');
}

// The link's origin (scheme + host + port) must equal one configured domain exactly. Comparing
// parsed origins rather than raw string prefixes rejects look-alikes such as
// "https://teams.microsoft.com.evil.vn" and "https://teams.microsoft.com@evil.vn".
// Returns the trimmed link — the value that was actually validated — for storage.
export function assertChannelLink(link: string, domain: string | null | undefined, channelName: string): string {
  const allowed = parseChannelDomains(domain);
  if (!allowed.length) {
    throw new BadRequestException(`INVALID_COWORKER_LINK: channel ${channelName} has no domain configured`);
  }
  const trimmed = (link ?? '').trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new BadRequestException(`INVALID_COWORKER_LINK: link for channel ${channelName} must be an absolute URL`);
  }
  if (parsed.username || parsed.password) {
    throw new BadRequestException(
      `INVALID_COWORKER_LINK: link for channel ${channelName} must not contain credentials`,
    );
  }
  if (!allowed.includes(parsed.origin.toLowerCase())) {
    throw new BadRequestException(`INVALID_COWORKER_LINK: link origin does not match channel ${channelName}`);
  }
  return trimmed;
}
