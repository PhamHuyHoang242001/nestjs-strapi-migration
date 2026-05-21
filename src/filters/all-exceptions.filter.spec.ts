import { BadRequestException, Logger } from '@nestjs/common';
import { ArgumentsHost } from '@nestjs/common/interfaces';
import { AllExceptionsFilter } from './all-exceptions.filter';

describe('AllExceptionsFilter', () => {
  const createHost = () => {
    const response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const request = {
      body: {},
      query: {},
      method: 'GET',
      url: '/api/media/transform-file/1',
      headers: {},
      ip: '127.0.0.1',
    };
    const host = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ArgumentsHost;

    return { host, response };
  };

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('passes through structured error payloads', () => {
    const filter = new AllExceptionsFilter();
    const { host, response } = createHost();
    const payload = {
      error: {
        name: 'ValidationError',
        message: 'E003',
        code: 'E003',
        details: {
          status: 400,
          error_message: 'code',
        },
      },
    };

    filter.catch(new BadRequestException(payload), host);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(payload);
  });

  it('keeps existing message response shape for string errors', () => {
    const filter = new AllExceptionsFilter();
    const { host, response } = createHost();

    filter.catch(new BadRequestException('invalid_request'), host);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      reason: undefined,
      message: 'invalid_request',
      statusCode: 400,
    });
  });
});
