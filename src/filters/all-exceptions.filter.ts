import { DATA_TYPE } from '@common/enums';
import { validateDatatype } from '@common/utils/index';

import { SYSTEM_ERROR } from '@constant/error-messages';
import { ArgumentsHost, Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Request, Response } from 'express';

import i18n from '../service/i18n';
import * as util from 'util';

@Catch()
export class AllExceptionsFilter extends BaseExceptionFilter {
  // constructor(
  //   @InjectPinoLogger(AllExceptionsFilter.name)
  //   private readonly logger1: PinoLogger,
  // ) {

  // }

  private readonly logger = new Logger(AllExceptionsFilter.name);

  async catch(exception: any, host: ArgumentsHost) {
    //HttpException
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const { body } = request;
    const { query, method, url } = request;
    const response = <any>ctx.getResponse<Response>();
    const ignoreRoute = ['/api/v1/auth/login'];

    const requestInfo = {
      method,
      url,
      body,
      query,
      ip: (request.headers['x-forwarded-for'] || request.ip || '').toString().replace('::ffff:', ''),
    };
    if (ignoreRoute.includes(url)) requestInfo.body = {};

    // Build a safe, serializable representation of the thrown value so logging
    // cannot crash the filter. This helps diagnose cases where non-Error objects
    // (for example `throw new Date()`) are thrown.
    let safeException: any = {};
    try {
      if (exception instanceof Error) {
        safeException.message = exception.message;
        safeException.stack = exception.stack;
        // copy enumerable properties defensively
        for (const k of Object.keys(exception)) {
          try {
            safeException[k] = (exception as any)[k];
          } catch (e) {
            safeException[k] = '[unserializable]';
          }
        }
      } else if (exception && typeof exception === 'object') {
        // shallow copy may still contain weird values; keep the raw object for inspect
        try {
          safeException = { ...exception };
        } catch (e) {
          safeException = { message: String(exception) };
        }
      } else {
        safeException = { message: String(exception) };
      }
    } catch (e) {
      safeException = { message: 'Unknown exception (failed to serialize)' };
    }

    const status = this.getStatusCode(exception);
    const { message, logTag } = this.getMessageError(exception);
    const logData = {
      tag: logTag,
      url: url,
      exception: safeException,
      // include a diagnostic string of the original thrown value
      thrownValueDebug: util.inspect(exception, { depth: 3 }),
      thrownValueType: exception && exception.constructor ? String(exception.constructor) : typeof exception,
      request: requestInfo,
    };
    const responseData = {
      reason: exception?.response?.reason,
      message: message,
      statusCode: status,
    };

    this.standardizeLogger(logData);
    return response.status(status).json(responseData);
  }
  getStatusCode(exception) {
    return exception instanceof HttpException
      ? exception.getStatus()
      : exception?.statusCode || HttpStatus.INTERNAL_SERVER_ERROR;
  }
  getMessageErrorHttpException(exception: HttpException) {
    const exceptionObject: any = exception.getResponse();
    let message = validateDatatype(exceptionObject.message, DATA_TYPE.STRING)
      ? exceptionObject.message
      : exceptionObject.message[0];
    // Avoid translating here; return raw message (may be an error code or key)
    try {
      if (!exceptionObject.validation) message = message;
    } catch (e) {
      // swallow
    }
    return message;
  }
  getMessageError(exception: any) {
    let logTag = 'NORMAL';
    let message = SYSTEM_ERROR;
    try {
      // Log exception diagnostic to help identify thrown value types
      try {
        console.log('Exception diag ->', util.inspect(exception, { depth: 3 }));
      } catch (e) {
        console.log('Exception diag ->', String(exception));
      }
      if (exception instanceof HttpException) {
        logTag = 'HttpException';
        message = this.getMessageErrorHttpException(exception);
      } else if (exception instanceof Error) {
        logTag = 'Error';
        message = exception.message; //(1)
      } else {
        if (validateDatatype(exception, DATA_TYPE.OBJECT)) {
          message = exception.message || message;
          // keep as-is
        } else {
          message = exception || message;
        }
      }
    } catch (error) {
      console.log('error');
    }
    return { message, logTag };
  }
  standardizeLogger(logData) {
    try {
      const payload: any = {
        type: logData.tag,
        date: new Date(),
        apiPath: logData.url,
        request: logData.request,
        thrownValueDebug: logData.thrownValueDebug,
        thrownValueType: logData.thrownValueType,
      };
      const exc = logData.exception || {};
      payload.exception = exc.stack || exc;
      payload.message = exc.message || (typeof exc === 'string' ? exc : undefined);

      try {
        this.logger.error(JSON.stringify(payload));
      } catch (err) {
        this.logger.error(util.inspect(payload, { depth: 5 }));
      }
    } catch (err) {
      try {
        this.logger.error('Failed to log exception: ' + String(err));
      } catch (e) {
        // ignore
      }
    }
  }
}
