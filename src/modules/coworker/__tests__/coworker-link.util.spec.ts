import { BadRequestException } from '@nestjs/common';
import { assertCoworkerLink } from '../coworker-link.util';

describe('assertCoworkerLink', () => {
  it('accepts Teams origin', () => {
    expect(assertCoworkerLink('https://teams.microsoft.com/l/meetup-join/x')).toContain('teams.microsoft.com');
  });

  it('rejects other origins', () => {
    expect(() => assertCoworkerLink('https://evil.com/x')).toThrow(BadRequestException);
  });

  it('rejects relative URLs', () => {
    expect(() => assertCoworkerLink('/relative')).toThrow(BadRequestException);
  });
});
