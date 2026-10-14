import { BadRequestException } from '@nestjs/common';
import { assertChannelLink, parseChannelDomains } from '../coworker-link.util';

const TEAMS = 'https://teams.microsoft.com';

describe('parseChannelDomains', () => {
  it('splits a comma-separated list, trims, lowercases, strips trailing slash', () => {
    expect(parseChannelDomains(' https://Outlook.Office.com/ , https://outlook.live.com ')).toEqual([
      'https://outlook.office.com',
      'https://outlook.live.com',
    ]);
  });

  it('drops empty entries from separator noise', () => {
    expect(parseChannelDomains(' , https://zalo.me ,, ')).toEqual(['https://zalo.me']);
  });

  it.each([null, '', '   ', ' , , '])('treats %p as no domain', (domain) => {
    expect(parseChannelDomains(domain)).toEqual([]);
  });
});

describe('assertChannelLink', () => {
  it('accepts a link whose origin matches the channel domain', () => {
    expect(assertChannelLink(`${TEAMS}/l/meetup-join/x`, TEAMS, 'Teams')).toBe(`${TEAMS}/l/meetup-join/x`);
  });

  it('matches case-insensitively and tolerates a trailing slash on the domain', () => {
    expect(() => assertChannelLink('https://TEAMS.microsoft.com/l/x', `${TEAMS}/`, 'Teams')).not.toThrow();
  });

  it('returns the trimmed link (surrounding whitespace is not stored)', () => {
    expect(assertChannelLink(`  ${TEAMS}/l/x\n`, TEAMS, 'Teams')).toBe(`${TEAMS}/l/x`);
  });

  it('matches a domain entered with the default port or in a different case', () => {
    expect(() => assertChannelLink(`${TEAMS}/l/x`, 'HTTPS://Teams.Microsoft.com:443', 'Teams')).not.toThrow();
  });

  it('accepts any origin of a multi-domain channel', () => {
    const domain = 'https://outlook.office.com,https://outlook.live.com';
    expect(() => assertChannelLink('https://outlook.office.com/mail/x', domain, 'Outlook')).not.toThrow();
    expect(() => assertChannelLink('https://outlook.live.com/mail/x', domain, 'Outlook')).not.toThrow();
    expect(() => assertChannelLink('https://outlook.office365.com/mail/x', domain, 'Outlook')).toThrow(
      BadRequestException,
    );
  });

  it.each([
    ['look-alike host suffix', 'https://teams.microsoft.com.evil.vn/x'],
    ['userinfo trick', 'https://teams.microsoft.com@evil.vn/x'],
    ['http instead of https', 'http://teams.microsoft.com/x'],
    ['other origin', 'https://evil.com/x'],
    ['non-http scheme', 'zalo://chat/x'],
    ['relative URL', '/relative'],
    ['not a URL', 'teams.microsoft.com/x'],
    ['embedded credentials', 'https://user:pass@teams.microsoft.com/x'],
    ['non-default port', 'https://teams.microsoft.com:8443/x'],
    ['trailing-dot host', 'https://teams.microsoft.com./x'],
    ['IDN look-alike host', 'https://tеams.microsoft.com/x'],
  ])('rejects %s', (_label, link) => {
    expect(() => assertChannelLink(link, TEAMS, 'Teams')).toThrow(BadRequestException);
  });

  it.each([null, '', ' , '])('rejects when the channel has no domain configured (%p)', (domain) => {
    expect(() => assertChannelLink(`${TEAMS}/x`, domain, 'Teams')).toThrow(
      new BadRequestException('INVALID_COWORKER_LINK: channel Teams has no domain configured'),
    );
  });
});
