import { Request } from 'express';

/** Shape of the `req.info` object populated by guards/middleware */
export interface RequestInfo {
  device_hash?: string;
  language?: string;
  client?: string | null;
  user?: Record<string, unknown>;
  ip?: string;
  domain?: string;
  host?: string;
  url?: string;
  [key: string]: unknown;
}

/** Express Request extended with the custom `info` property set by guards */
export interface RequestWithInfo extends Request {
  info: RequestInfo;
}
