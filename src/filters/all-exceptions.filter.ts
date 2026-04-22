import { DATA_TYPE } from '@common/enums';
import { validateDatatype } from '@common/utils/index';

import { SYSTEM_ERROR } from '@constant/error-messages';
import { ArgumentsHost, Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Request, Response } from 'express';

import * as util from 'util';

@Catch()
export class AllExceptionsFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { body } = request;
    const { query, method, url } = request;
    const response = ctx.getResponse<Response>();
    const ignoreRoute = ['/api/v1/auth/login'];

    const requestInfo: Record<string, unknown> = {
      method,
      url,
      body,
      query,
      ip: (request.headers['x-forwarded-for'] || request.ip || '').toString().replace('::ffff:', ''),
    };
    if (ignoreRoute.includes(url)) requestInfo.body = {};

    // Build a safe, serializable representation of the thrown value so logging
    // cannot crash the filter.
    let safeException: Record<string, unknown> = {};
    try {
      if (exception instanceof Error) {
        safeException.message = exception.message;
        safeException.stack = exception.stack;
        for (const k of Object.keys(exception)) {
          try {
            safeException[k] = (exception as unknown as Record<string, unknown>)[k];
          } catch {
            safeException[k] = '[unserializable]';
          }
        }
      } else if (exception && typeof exception === 'object') {
        try {
          safeException = { ...(exception as Record<string, unknown>) };
        } catch {
          safeException = { message: util.inspect(exception) };
        }
      } else {
        safeException = { message: util.inspect(exception) };
      }
    } catch {
      safeException = { message: 'Unknown exception (failed to serialize)' };
    }

    const status = this.getStatusCode(exception);
    const { message, logTag } = this.getMessageError(exception);
    const logData = {
      tag: logTag,
      url: url,
      exception: safeException,
      thrownValueDebug: util.inspect(exception, { depth: 3 }),
      thrownValueType:
        exception && typeof exception === 'object' && exception.constructor
          ? String(exception.constructor)
          : typeof exception,
      request: requestInfo,
    };
    const exceptionObj = exception as Record<string, unknown> | undefined;
    const responseData = {
      reason: (exceptionObj?.['response'] as Record<string, unknown> | undefined)?.['reason'],
      message: message,
      statusCode: status,
    };

    this.standardizeLogger(logData);
    return response.status(status).json(responseData);
  }

  getStatusCode(exception: unknown): number {
    if (exception instanceof HttpException) {
      return exception.getStatus();
    }
    const exc = exception as Record<string, unknown> | undefined;
    return (exc?.['statusCode'] as number) || HttpStatus.INTERNAL_SERVER_ERROR;
  }

  getMessageErrorHttpException(exception: HttpException): string {
    const exceptionObject = exception.getResponse() as Record<string, unknown>;
    const message = validateDatatype(exceptionObject['message'], DATA_TYPE.STRING)
      ? (exceptionObject['message'] as string)
      : (exceptionObject['message'] as string[])[0];
    return message;
  }

  getMessageError(exception: unknown): { message: string; logTag: string } {
    let logTag = 'NORMAL';
    let message = SYSTEM_ERROR;
    try {
      try {
        console.log('Exception diag ->', util.inspect(exception, { depth: 3 }));
      } catch {
        console.log('Exception diag ->', util.inspect(exception));
      }
      if (exception instanceof HttpException) {
        logTag = 'HttpException';
        message = this.getMessageErrorHttpException(exception);
      } else if (exception instanceof Error) {
        logTag = 'Error';
        message = exception.message;
      } else {
        if (validateDatatype(exception, DATA_TYPE.OBJECT)) {
          const exc = exception as Record<string, unknown>;
          message = (exc['message'] as string) || message;
        } else {
          message = (exception as string) || message;
        }
      }
    } catch {
      console.log('error');
    }
    return { message, logTag };
  }

  standardizeLogger(logData: Record<string, unknown>): void {
    try {
      const exc = (logData['exception'] as Record<string, unknown>) || {};
      const payload: Record<string, unknown> = {
        type: logData['tag'],
        date: new Date(),
        apiPath: logData['url'],
        request: logData['request'],
        thrownValueDebug: logData['thrownValueDebug'],
        thrownValueType: logData['thrownValueType'],
        exception: exc['stack'] || exc,
        message: exc['message'] || (typeof exc === 'string' ? exc : undefined),
      };

      try {
        this.logger.error(JSON.stringify(payload));
      } catch {
        this.logger.error(util.inspect(payload, { depth: 5 }));
      }
    } catch (err) {
      try {
        this.logger.error('Failed to log exception: ' + String(err));
      } catch {
        // ignore
      }
    }
  }
}
