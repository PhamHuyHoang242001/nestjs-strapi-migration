jest.mock('@configuration/env.config', () => ({
  BASE_END_USER_URL: 'https://app.example.com',
  OIDC_AUTHORIZATION_ENDPOINT: 'https://adfs.example.com/authorize',
  OIDC_CLIENT_ID: 'client-id',
  OIDC_CLIENT_SECRET: 'secret',
  OIDC_GRANT_TYPE: 'authorization_code',
  OIDC_REDIRECT_URI: 'https://api.example.com/api/custom-auth/oidc/callback',
  OIDC_SCOPE: 'openid email',
  OIDC_TLS_INSECURE: false,
  OIDC_TOKEN_ENDPOINT: 'https://adfs.example.com/token',
}));

import axios from 'axios';
import { BadRequestException } from '@nestjs/common';
import { OidcSsoService } from './oidc-sso.service';
import { USER_STATUS } from '@common/enums';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

function jwtWith(payload: object): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64');
  return `${header}.${body}.s`;
}

describe('OidcSsoService', () => {
  const authService = { createToken: jest.fn() };
  const userRepository = { findOneBy: jest.fn(), createData: jest.fn() };
  let service: OidcSsoService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new OidcSsoService(authService as never, userRepository as never);
  });

  describe('buildAuthorizationUrl', () => {
    it('packs extra query into state like Strapi', () => {
      const url = service.buildAuthorizationUrl({
        state: 'abc',
        report_code: 'R1',
        file_id: '9',
        redirect_url: 'https://app.example.com/report',
      });
      const packed = 'abc&report_code=R1&file_id=9&redirect_url=https://app.example.com/report';
      const encodedState = encodeURIComponent(packed);
      expect(url).toContain(`state=${encodedState}`);
      const parsed = new URL(url);
      expect(parsed.searchParams.get('response_type')).toBe('code');
      expect(parsed.searchParams.get('response_mode')).toBe('query');
      expect(parsed.searchParams.get('scope')).toBe('openid email');
      expect(parsed.searchParams.get('state')).toBe(packed);
    });

    it('rejects redirect_url outside BASE_END_USER_URL', () => {
      expect(() => service.buildAuthorizationUrl({ redirect_url: 'https://evil.com' })).toThrow(BadRequestException);
    });
  });

  describe('handleCallback', () => {
    it('redirects to /login when code missing', async () => {
      const url = await service.handleCallback({}, {});
      expect(url).toBe('https://app.example.com/login');
    });

    it('exchanges code, find-or-create user, redirects with Nest accessToken', async () => {
      mockedAxios.post.mockResolvedValue({
        data: {
          access_token: jwtWith({ sub: 'adfs-1' }),
          id_token: jwtWith({ email: 'U@Bank.COM', sub: 'adfs-1' }),
        },
      });
      userRepository.findOneBy.mockResolvedValue(null);
      userRepository.createData.mockResolvedValue({ id: 42, email: 'u@bank.com' });
      authService.createToken.mockResolvedValue({ token: 'nest-jwt' });

      const url = await service.handleCallback({ code: 'c1', state: 'abc%26report_code%3DR1' }, { domain: 'd' });

      expect(userRepository.createData).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'u@bank.com',
          username: 'adfs-1',
          status: USER_STATUS.ACTIVE,
        }),
      );
      expect(url).toBe('https://app.example.com/login?accessToken=nest-jwt&state=abc&report_code=R1');
    });

    it('redirects to /login on token exchange failure', async () => {
      mockedAxios.post.mockRejectedValue(new Error('adfs down'));
      const url = await service.handleCallback({ code: 'c1' }, {});
      expect(url).toBe('https://app.example.com/login');
    });
  });
});
