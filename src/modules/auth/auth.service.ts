import { STATUS, TOKEN_TYPE, USER_CLIENT, USER_STATUS } from '@common/enums';
import { comparePassword, decryptToken, generateToken, hashPassword, randomStringUuid } from '@common/utils';
import { TOKEN_TIME } from '@constant/auth';
import {
  DATA_INVALID,
  EXPIRED,
  MAPPING_ENCRYPT_TOKEN,
  MODEL_AUTH_CONFIRM_PASSWORD_NOT_MATCH,
  MODEL_AUTH_OLD_PASSWORD_INVALID,
  MODEL_AUTH_USERNAME_INVALID,
} from '@constant/index';
import { TokenRepository } from '@modules/token/repository/token.repository';
import { Users } from '@modules/databases/user.entity';
import { UserRepository } from '@modules/users/repository/users.repository';
import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as dayjs from 'dayjs';
import { EmailDto, LogoutDto, RefreshTokenDto, TokenDto, UserLoginDto } from './dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RecoverPasswordDto } from './dto/confirm-forgot-password.dto';
import { AccessToken, ClientBasic, ClientBearer, ICreateToken } from './interfaces';
import { UserRegisterDto } from './dto/register.dto';
import { ERROR_CODE } from '@constant/error-code';
import { AdminRepository } from '@modules/admins/repository/admin.repository';
import { CommonServiceService } from '@modules/common-service/common-service.service';
import { DayJS } from '@common/utils/dayjs';
import axios from 'axios';
import {
  OIDC_ISSUER,
  OIDC_CLIENT_ID,
  OIDC_CLIENT_SECRET,
  OIDC_REDIRECT_URI,
  OIDC_TOKEN_ENDPOINT,
  OIDC_USERINFO_ENDPOINT,
} from '@configuration/env.config';

@Injectable()
export class AuthService {
  constructor(
    private readonly tokenRepository: TokenRepository,
    private readonly userRepository: UserRepository,
    private readonly adminRepository: AdminRepository,
    private readonly commonService: CommonServiceService,
  ) {}

  checkPassword(password: string, hash: string, _messageError?: string, errorCode = ERROR_CODE.A007) {
    if (!comparePassword(password, hash)) throw new BadRequestException(errorCode);
    return true;
  }

  async checkAccountExist(email: string, client: USER_CLIENT): Promise<Record<string, unknown>> {
    let account: Record<string, unknown> | null = null;
    if (client === USER_CLIENT.USER) {
      account = (await this.userRepository.findOneBy({
        email,
        status: USER_STATUS.ACTIVE,
        deleted_at: null,
      })) as unknown as Record<string, unknown> | null;
    } else {
      account = (await this.adminRepository.findOneBy({
        email,
        status: USER_STATUS.ACTIVE,
        deleted_at: null,
      })) as unknown as Record<string, unknown> | null;
    }
    if (!account) throw new BadRequestException(ERROR_CODE.A007);
    return account;
  }

  async login(data: UserLoginDto, client: USER_CLIENT, header: ClientBasic): Promise<AccessToken> {
    const { email, password, remember_me } = data;
    const { domain } = header;
    const user = await this.checkAccountExist(email, client);
    this.checkPassword(password, user['password'] as string);
    return this.createToken(user['id'] as number, client, domain, false, remember_me);
  }

  async register(payload: UserRegisterDto, header: ClientBasic): Promise<AccessToken> {
    const {
      email,
      password,
      date_of_birth,
      first_name,
      last_name,
      phone,
      country_iso,
      state_iso,
      otp,
      gender,
      phone_code,
      phone_iso,
    } = payload;
    const userVerified = await this.userRepository.findOneBy({
      email,
      verify_code: otp,
      status: USER_STATUS.VERIFY_CODE,
      deleted_at: null,
    });
    if (!userVerified) {
      throw new BadRequestException('Please verify email before sigup');
    }

    const { validCountry, validState } = await this.validateAddress(country_iso, state_iso, phone, phone_code);

    const data: Partial<Users> & Record<string, unknown> = {
      email,
      status: USER_STATUS.ACTIVE,
      password: hashPassword(password),
      date_of_birth: DayJS(date_of_birth).utc().format('YYYY-MM-DD'),
      first_name,
      last_name,
      phone,
      country: validCountry ? ((validCountry as Record<string, unknown>).name as string) : null,
      country_iso: validCountry ? country_iso : null,
      state: validState ? ((validState as Record<string, unknown>).name as string) : null,
      state_iso: validState ? state_iso : null,
      gender,
      phone_code,
      phone_iso,
    };
    await this.userRepository.updateOne({ email }, data as Partial<Users>);
    const { domain, device_hash } = header;
    return this.createToken(userVerified.id, domain, device_hash, false, false);
  }

  async createToken(
    user: number,
    domain: string,
    device_hash: string,
    ask_change_pwd: boolean = false,
    remember_me: boolean = false,
    is_mobile: boolean = false,
  ) {
    const { token, expired_at } = await this.generateToken({
      user,
      type: TOKEN_TYPE.LOGIN,
      remember_me,
      device_hash,
      is_mobile,
    });
    const { token: refresh_token, expired_at: refresh_token_expired_at } = await this.generateToken({
      user,
      type: TOKEN_TYPE.REFRESH_TOKEN,
      remember_me,
      device_hash,
      is_mobile,
    });

    return {
      token,
      expired_at,
      refresh_token,
      refresh_token_expired_at,
      ask_change_pwd,
    };
  }

  async generateToken(payload: ICreateToken) {
    const { token_ref = null, user, type, remember_me = false, device_hash, is_mobile } = payload;
    let time: number | undefined;
    const time_extend_remember_login = remember_me ? 14 * 24 * 60 : 0;
    switch (type) {
      case TOKEN_TYPE.LOGIN:
        time = TOKEN_TIME[`${USER_CLIENT.USER}_TIME`];
        break;
      case TOKEN_TYPE.RECOVER_PASSWORD:
        time = TOKEN_TIME.RECOVER_PASSWORD;
        break;
      case TOKEN_TYPE.DELETE_ACCOUNT:
        time = TOKEN_TIME.DELETE_ACCOUNT;
        break;
      default:
        break;
    }
    const user_id = user;
    const expired_at = is_mobile
      ? null
      : dayjs()
          .add((time ?? 0) + time_extend_remember_login, 'minutes')
          .toDate();
    const options: Record<string, unknown> = {
      token: '',
      token_ref,
      user_id,
      type,
      device_hash,
      expired_at: expired_at?.valueOf(),
      timestamp: dayjs().valueOf(),
      options: payload.options || {},
    };

    if (is_mobile) delete options['expired_at'];

    const opts = options['options'] as Record<string, unknown>;
    Object.keys(opts).forEach((key) => {
      if (!opts[key]) delete opts[key];
    });

    const value: Record<string, unknown> = {};
    MAPPING_ENCRYPT_TOKEN.forEach((u) => {
      value[u.fieldName] = options[u.fieldMapping];
    });
    Object.keys(value).forEach((key) => {
      if (!value[key]) delete value[key];
    });

    if (user_id) {
      value['uid'] = user_id;
    }
    const access_token = generateToken(value);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const savedToken = (await this.tokenRepository.save({ ...options, expired_at, access_token } as any)) as {
      id: number;
    };
    const { id } = savedToken;

    return {
      id,
      token: access_token,
      expired_at,
    };
  }

  async logOut(payload: LogoutDto) {
    const { access_token } = payload;
    await this.tokenRepository.checkTokenValid(access_token, [TOKEN_TYPE.LOGIN]);

    await this.tokenRepository.delete({ access_token });
    return { logout: true };
  }

  async refreshSession(data: RefreshTokenDto, header: ClientBasic): Promise<AccessToken> {
    const { refresh_token } = data;
    const { domain, device_hash } = header;
    const tokenDecrypt = decryptToken(refresh_token) as Record<string, unknown>;
    const admin_id = tokenDecrypt['client'] === USER_CLIENT.ADMIN ? tokenDecrypt['user_id'] : null;
    const user_id = tokenDecrypt['client'] === USER_CLIENT.USER ? tokenDecrypt['user_id'] : null;
    const pipeline: Record<string, unknown> = {
      access_token: refresh_token,
      client: tokenDecrypt['client'],
      status: STATUS.ACTIVE,
    };
    if (admin_id) pipeline['admin_id'] = admin_id;
    if (user_id) pipeline['user_id'] = user_id;
    const rs = await this.tokenRepository.findOneByCondition(pipeline);
    if (!rs || (rs?.expired_at && dayjs(rs?.expired_at).isBefore(dayjs()))) throw new UnauthorizedException(EXPIRED);

    let account: Record<string, unknown> | undefined;
    if (tokenDecrypt['client'] === USER_CLIENT.USER) {
      account = (await this.userRepository.checkUserValid({
        id: tokenDecrypt['user_id'] as number,
      })) as unknown as Record<string, unknown>;
    } else if (tokenDecrypt['client'] === USER_CLIENT.ADMIN) {
      account = (await this.adminRepository.checkAdminValid({
        id: tokenDecrypt['user_id'] as number,
      })) as unknown as Record<string, unknown>;
    }
    const tokenResponse = await this.createToken(account?.['id'] as number, domain, device_hash);
    return tokenResponse;
  }

  async removeRefreshToken(refreshToken: string) {
    const rs = await this.tokenRepository.findOneBy({ access_token: refreshToken, status: STATUS.ACTIVE });
    if (!rs) throw new NotFoundException();

    await this.tokenRepository.delete({ access_token: refreshToken });
    return 0;
  }

  profile(user: Users) {
    return user;
  }

  async deleteMyAccount(body: TokenDto, header: ClientBearer): Promise<void> {
    const { user } = header;
    const { token } = body;
    await this.tokenRepository.checkTokenValid(token, [TOKEN_TYPE.DELETE_ACCOUNT]);
    const userId = (user as unknown as Record<string, unknown>)?.['id'] as number;
    await this.userRepository.softDelete(userId);
    await this.tokenRepository.destroyTokenUser(userId, [
      TOKEN_TYPE.LOGIN,
      TOKEN_TYPE.REFRESH_TOKEN,
      TOKEN_TYPE.DELETE_ACCOUNT,
    ]);
  }

  async recoverAccount(data: EmailDto, header: ClientBearer) {
    const { email } = data;
    const { domain, device_hash } = header;
    const rs = await this.userRepository.findOneBy({ email });
    if (!rs) throw new NotFoundException(MODEL_AUTH_USERNAME_INVALID);
    await this.userRepository.updateOne({ id: rs.id }, { deleted_at: null });
    return this.createToken(rs.id, domain, device_hash, false, false);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  forgotPassword(data: EmailDto, _client: USER_CLIENT) {
    const { email } = data;
    return {
      email,
    };
  }

  async recoverPassword(data: RecoverPasswordDto, client: USER_CLIENT) {
    const { password, confirm_password, token } = data;
    if (password != confirm_password) throw new BadRequestException(DATA_INVALID);

    const rs = await this.tokenRepository.checkTokenValid(token, [TOKEN_TYPE.RECOVER_PASSWORD]);

    if ((client === USER_CLIENT.USER && !rs.user_id) || (client === USER_CLIENT.ADMIN && !rs.admin_id))
      throw new NotFoundException(MODEL_AUTH_USERNAME_INVALID);
    if (client === USER_CLIENT.USER) {
      await this.userRepository.updateOne({ id: rs.user_id }, { password: hashPassword(password) });
      await this.tokenRepository.destroyTokenUser(rs.user_id, [
        TOKEN_TYPE.LOGIN,
        TOKEN_TYPE.REFRESH_TOKEN,
        TOKEN_TYPE.RECOVER_PASSWORD,
      ]);
    } else if (client === USER_CLIENT.ADMIN) {
      await this.adminRepository.updateOne({ id: rs.admin_id }, { password: hashPassword(password) });
      await this.tokenRepository.destroyTokenAdmin(rs.admin_id, [
        TOKEN_TYPE.LOGIN,
        TOKEN_TYPE.REFRESH_TOKEN,
        TOKEN_TYPE.RECOVER_PASSWORD,
      ]);
    }
  }

  async updatePassword(id: number, user_id: number, password: string) {
    await this.userRepository.updateOne({ id }, { password: hashPassword(password) });
    await this.tokenRepository.destroyTokenUser(user_id, [TOKEN_TYPE.LOGIN, TOKEN_TYPE.REFRESH_TOKEN]);
  }

  async changePassword(data: ChangePasswordDto, user_id: number) {
    const { password, confirm_password, old_password } = data;
    if (password != confirm_password) throw new BadRequestException(MODEL_AUTH_CONFIRM_PASSWORD_NOT_MATCH);
    if (password === old_password) throw new BadRequestException(ERROR_CODE.CP002);
    const rs = await this.userRepository.findOneBy({ id: user_id });
    if (!rs) throw new BadRequestException(MODEL_AUTH_USERNAME_INVALID);
    this.checkPassword(old_password, rs.password, MODEL_AUTH_OLD_PASSWORD_INVALID, ERROR_CODE.CP001);
    await this.updatePassword(rs.id, rs.id, password);
  }

  async getTokenByGuest(guest_id: string, header: ClientBearer) {
    const user = await this.userRepository.findOneBy({ guest_id, is_registered: false });
    const { domain, device_hash } = header;
    if (!user) throw new BadRequestException('Invalid data');
    return this.createToken(user.id, domain, device_hash);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  validateAddress(_countryIso: string, _stateIso: string, _phone: string, _phoneCode: string) {
    const validCountry: unknown = undefined;
    const validState: unknown = undefined;
    return Promise.resolve({ validCountry, validState });
  }

  /**
   * Handle OIDC callback: exchange code for tokens, fetch userinfo, find/create user, return local tokens
   */
  async handleOidcCallback(code: string, header: Record<string, unknown>) {
    if (!code) throw new BadRequestException(DATA_INVALID);
    // Exchange code for token
    const tokenEndpoint = OIDC_TOKEN_ENDPOINT || `${OIDC_ISSUER}/protocol/openid-connect/token`;
    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    params.append('redirect_uri', OIDC_REDIRECT_URI);
    params.append('client_id', OIDC_CLIENT_ID);
    if (OIDC_CLIENT_SECRET) params.append('client_secret', OIDC_CLIENT_SECRET);

    const tokenRes = await axios.post<{ access_token?: string }>(tokenEndpoint, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const access_token = tokenRes?.data?.access_token;
    if (!access_token) throw new BadRequestException('Invalid OIDC response');

    // Fetch userinfo
    const userinfoEndpoint = OIDC_USERINFO_ENDPOINT || `${OIDC_ISSUER}/protocol/openid-connect/userinfo`;
    const userinfoRes = await axios.get<Record<string, string>>(userinfoEndpoint, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const userinfo = userinfoRes?.data ?? {};

    const email = userinfo['email'] || userinfo['preferred_username'];
    const first_name = userinfo['given_name'] || userinfo['first_name'] || '';
    const last_name = userinfo['family_name'] || userinfo['last_name'] || '';

    if (!email) throw new BadRequestException('OIDC userinfo missing email');

    // Find or create local user
    let user = await this.userRepository.findOneBy({ email });
    if (!user) {
      const created = await this.userRepository.createData({
        email,
        first_name,
        last_name,
        status: USER_STATUS.ACTIVE,
        password: hashPassword(randomStringUuid()),
      } as unknown as Users);
      user = created;
    }

    const domain = (header?.['domain'] as string) || '';
    const device_hash = (header?.['device_hash'] as string) || '';
    return this.createToken(user.id, domain, device_hash, false, false);
  }
}
