import { USER_CLIENT, USER_STATUS } from '@common/enums';
import { hashPassword, randomStringUuid } from '@common/utils';
import {
  BASE_END_USER_URL,
  OIDC_AUTHORIZATION_ENDPOINT,
  OIDC_CLIENT_ID,
  OIDC_CLIENT_SECRET,
  OIDC_GRANT_TYPE,
  OIDC_REDIRECT_URI,
  OIDC_SCOPE,
  OIDC_TLS_INSECURE,
  OIDC_TOKEN_ENDPOINT,
} from '@configuration/env.config';
import { DATA_INVALID } from '@constant/index';
import { Users } from '@modules/databases/user.entity';
import { UserRepository } from '@modules/users/repository/users.repository';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as https from 'https';
import { AuthService } from './auth.service';
import { parseJwt } from '@common/utils';

@Injectable()
export class OidcSsoService {
  private readonly logger = new Logger(OidcSsoService.name);

  constructor(
    private readonly authService: AuthService,
    private readonly userRepository: UserRepository,
  ) {}

  buildAuthorizationUrl(query: Record<string, unknown>): string {
    const redirectUrl = String(query['redirect_url'] ?? '');
    if (redirectUrl) {
      if (!BASE_END_USER_URL || !redirectUrl.startsWith(BASE_END_USER_URL)) {
        throw new BadRequestException(DATA_INVALID);
      }
    }

    let redirectParam = String(query['state'] ?? '');
    for (const [key, raw] of Object.entries(query)) {
      const value = raw == null ? '' : String(raw);
      if (key === 'state') continue;
      if (!value || value === 'undefined' || value === 'null' || !value.trim()) continue;
      redirectParam += `&${key}=${value}`;
    }

    // Same as Strapi oidcSignIn: encode the packed query string once, then append as state=.
    const encodedState = encodeURIComponent(redirectParam);
    return (
      `${OIDC_AUTHORIZATION_ENDPOINT}?response_type=code&response_mode=query` +
      `&client_id=${encodeURIComponent(OIDC_CLIENT_ID)}` +
      `&redirect_uri=${encodeURIComponent(OIDC_REDIRECT_URI)}` +
      `&scope=${encodeURIComponent(OIDC_SCOPE)}` +
      `&state=${encodedState}`
    );
  }

  loginFailureRedirect(): string {
    return `${BASE_END_USER_URL}/login`;
  }

  async handleCallback(query: Record<string, unknown>, header: Record<string, unknown>): Promise<string> {
    const code = query['code'] == null ? '' : String(query['code']);
    const state = query['state'] == null ? '' : String(query['state']);
    if (!code) {
      this.logger.log('[oidcSignInCallback] Error code missing');
      return this.loginFailureRedirect();
    }

    try {
      const tokens = await this.exchangeCode(code);
      const { payload } = parseJwt(tokens.access_token) ?? { payload: {} };
      const idParsed = tokens.id_token ? parseJwt(tokens.id_token) : null;
      const claims = { ...(idParsed?.payload ?? {}), ...payload };
      const emailRaw = claims['email'] ?? claims['upn'] ?? claims['unique_name'] ?? claims['preferred_username'];
      const sub = claims['sub'] == null ? '' : String(claims['sub']);
      if (!emailRaw) throw new BadRequestException('OIDC token missing email');
      const email = String(emailRaw).toLowerCase();

      const user = await this.findOrCreateUser(email, sub);
      const domain = (header?.['domain'] as string) || '';
      const device_hash = (header?.['device_hash'] as string) || '';
      const { token } = await this.authService.createToken(user.id, USER_CLIENT.USER, domain, device_hash, false, false);

      const decodedState = decodeURIComponent(state);
      let redirectUrl = `${BASE_END_USER_URL}/login?accessToken=${token}&state=${decodedState}`;
      redirectUrl = redirectUrl.replaceAll('}', '');
      return redirectUrl;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.log(`[oidcSignInCallback] Error err = ${message}`);
      return this.loginFailureRedirect();
    }
  }

  private async exchangeCode(code: string): Promise<{ access_token: string; id_token?: string }> {
    const params = new URLSearchParams();
    params.append('code', code);
    params.append('client_id', OIDC_CLIENT_ID);
    params.append('client_secret', OIDC_CLIENT_SECRET);
    params.append('redirect_uri', OIDC_REDIRECT_URI);
    params.append('grant_type', OIDC_GRANT_TYPE);

    const httpsAgent = OIDC_TLS_INSECURE ? new https.Agent({ rejectUnauthorized: false }) : undefined;
    const response = await axios.post<{ access_token?: string; id_token?: string }>(OIDC_TOKEN_ENDPOINT, params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      httpsAgent,
    });
    const access_token = response.data?.access_token;
    if (!access_token) throw new BadRequestException('Invalid OIDC response');
    return { access_token, id_token: response.data?.id_token };
  }

  private async findOrCreateUser(email: string, username: string): Promise<Users> {
    const existing = await this.userRepository.findOneBy([{ email }, { username: email }, { username }]);
    if (existing) {
      if (existing.status !== USER_STATUS.ACTIVE) {
        throw new BadRequestException('User is not active');
      }
      return existing;
    }
    try {
      return await this.userRepository.createData({
        email,
        username: username || email,
        status: USER_STATUS.ACTIVE,
        password: hashPassword(randomStringUuid()),
      } as Users);
    } catch {
      const raced = await this.userRepository.findOneBy([{ email }, { username }]);
      if (raced && raced.status === USER_STATUS.ACTIVE) return raced;
      throw new BadRequestException('Unable to provision SSO user');
    }
  }
}
