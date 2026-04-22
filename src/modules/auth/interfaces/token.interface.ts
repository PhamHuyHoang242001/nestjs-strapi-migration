import { LANGUAGE, TOKEN_TYPE } from '@common/enums';
import { Users } from '@modules/databases/user.entity';

export interface ICreateToken {
  token_ref?: string;
  user: number;
  options?: object;
  type: TOKEN_TYPE;
  remember_me?: boolean;
  device_hash?: string;
  is_mobile?: boolean;
}

export interface ClientBasic {
  ip: string;
  domain: string;

  host: string;
  url: string;

  device_hash: string;

  language: LANGUAGE;

  type: TOKEN_TYPE;
}
export interface ClientBearer {
  language: LANGUAGE;
  user: Users;

  role: string;
  domain: string;
  device_hash: string;

  host: string;
  url: string;
  ip: string;
}

export interface AccessToken {
  token: string;
  refresh_token: string;
  expired_at: Date;
  refresh_token_expired_at: Date;
  ask_change_pwd: boolean;
}

export interface RegisterBiometrict {
  id: string;
}

export interface ISendOtp {
  otp: boolean;
  message: string;
  value?: string;
}
export interface IToken {
  token: string;
}
