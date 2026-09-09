import { parseJwt } from '../parse-jwt.util';

function jwtPart(obj: object): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64');
}

describe('parseJwt', () => {
  it('returns header, payload, signature', () => {
    const header = { alg: 'RS256', typ: 'JWT' };
    const payload = { email: 'a@b.c', sub: 'u1' };
    const token = `${jwtPart(header)}.${jwtPart(payload)}.sig`;
    expect(parseJwt(token)).toEqual({
      header,
      payload,
      signature: 'sig',
    });
  });

  it('returns null for empty or malformed token', () => {
    expect(parseJwt('')).toBeNull();
    expect(parseJwt('not-a-jwt')).toBeNull();
  });
});
