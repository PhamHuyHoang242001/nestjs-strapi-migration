import { BadRequestException } from '@nestjs/common';
import isEmail from 'validator/lib/isEmail';

// How a channel's link is matched against its `domain` entries (ai_hub_coworker_channels.type).
// - prefix (default, NULL): the value is a URL whose origin equals one entry (Teams, Zalo).
// - suffix: the value ends with one entry, e.g. an Outlook address ending in "@vpbank.com.vn".
export type ChannelLinkMatchType = 'prefix' | 'suffix';
export const CHANNEL_LINK_MATCH_TYPES: readonly ChannelLinkMatchType[] = ['prefix', 'suffix'];

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
// The link is optional: null / empty / whitespace-only returns null (stored as NULL) without a domain
// check. Otherwise returns the trimmed link — the value that was actually validated — for storage.
export function assertChannelLink(
  link: string | null | undefined,
  domain: string | null | undefined,
  channelName: string,
  type?: string | null,
): string | null {
  const trimmed = (link ?? '').trim();
  if (!trimmed) return null;
  const allowed = parseChannelDomains(domain);
  if (!allowed.length) {
    throw new BadRequestException(`INVALID_COWORKER_LINK: channel ${channelName} has no domain configured`);
  }
  const matchType = (type ?? '').trim().toLowerCase() || 'prefix';
  if (matchType === 'suffix') return assertSuffixValue(trimmed, allowed, channelName);
  if (matchType !== 'prefix') {
    throw new BadRequestException(`INVALID_COWORKER_LINK: channel ${channelName} has an unknown type "${type}"`);
  }
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

// Suffix match: the value must end with one entry (case-insensitive) and contain no whitespace.
// An entry starting with "@" means an email domain, so the value must also be a single valid
// address — this rejects "x@evil.com@vpbank.com.vn" and a bare "@vpbank.com.vn".
function assertSuffixValue(value: string, allowed: string[], channelName: string): string {
  const lower = value.toLowerCase();
  const matched = /\s/.test(value) ? undefined : allowed.find((s) => lower.length > s.length && lower.endsWith(s));
  if (!matched || (matched.startsWith('@') && !isEmail(value))) {
    throw new BadRequestException(`INVALID_COWORKER_LINK: value does not match channel ${channelName}`);
  }
  return value;
}
