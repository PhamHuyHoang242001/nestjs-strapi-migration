import { LANGUAGE } from '@common/enums';
import { URL_NOT_FOUND } from '@constant/error-messages';
import { CHARACTER_SEPARATE_SUB_INFO } from '@constant/index';
import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const i18n = require('../../service/i18n') as {
  default?: { setLocale: (lang: string) => void };
  setLocale?: (lang: string) => void;
};

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    const { method, originalUrl } = req;
    const ip = (req.headers['x-forwarded-for'] || req.ip || '').toString().replace('::ffff:', '');
    const origin = req.get('origin');
    const host = req.get('host') || 'localhost';
    const hostname = origin ? `${origin}/` : `${req.protocol || 'http'}://${host}/`;
    const parts = hostname.split('://');
    const domain = parts.length > 1 ? (parts[1] || 'localhost').split(':')[0] : 'localhost';

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const deviceHeader = req.headers.device;
    const parsedDevice = typeof deviceHeader === 'string' && deviceHeader ? JSON.parse(deviceHeader) : (typeof deviceHeader === 'object' ? deviceHeader : {});
    req.headers.device = Object.assign(
      { browser: '' },
      parsedDevice,
      {
        ip,
        userAgent: `${(req.headers['sec-ch-ua'] || '').toString().replace(/"/g, '')}${CHARACTER_SEPARATE_SUB_INFO}${
          req.headers['user-agent']
        }`,
      },
    );

    req.headers.hostname = hostname;
    req.headers.domain = domain;
    req.headers.ip = ip;
    req.headers['accept-language'] = LANGUAGE.EN;
    const i18nInstance = (i18n.default ?? i18n) as { setLocale: (lang: string) => void };
    i18nInstance.setLocale(req.headers['accept-language']);

    if (originalUrl.indexOf('/api/') == -1 && originalUrl.indexOf('/upload/') == -1) {
      return res.json({ error: 404, message: URL_NOT_FOUND });
    }

    const body: unknown = req.body;
    console.log('log request...', originalUrl, 'language', req.headers['accept-language']);

    this.logger.log(
      JSON.stringify({
        method,
        url: originalUrl,
        IP: ip,
        header: { authorization: req.headers.authorization },
        body,
      }),
    );
    return next();
  }
}
