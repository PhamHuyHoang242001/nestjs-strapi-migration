import { NextFunction, Request, Response } from 'express';
import { LoggerMiddleware } from './logger.middleware';

type MockReq = {
  method: string;
  originalUrl: string;
  ip: string;
  protocol: string;
  body: unknown;
  headers: Record<string, unknown>;
  get: (name: string) => string | undefined;
};

const buildReq = (deviceHeader?: unknown): MockReq => ({
  method: 'POST',
  originalUrl: '/api/v1/auth/login',
  ip: '127.0.0.1',
  protocol: 'http',
  body: {},
  headers: deviceHeader === undefined ? {} : { device: deviceHeader },
  get: (name: string) => (name === 'host' ? 'localhost:3002' : undefined),
});

const run = (deviceHeader?: unknown) => {
  const middleware = new LoggerMiddleware();
  const req = buildReq(deviceHeader);
  const next = jest.fn() as unknown as NextFunction;
  const res = { json: jest.fn() } as unknown as Response;
  middleware.use(req as unknown as Request, res, next);
  return { req, next, res };
};

describe('LoggerMiddleware device header parsing', () => {
  // A plain-string (non-JSON) device header must NOT crash the request. Regression guard:
  // clients send arbitrary device identifiers, and an unguarded JSON.parse used to throw
  // a SyntaxError that surfaced as HTTP 500 on every /api/ route.
  it('does not throw on a non-JSON string device header and preserves it as an id', () => {
    let result: ReturnType<typeof run>;
    expect(() => (result = run('test-device'))).not.toThrow();
    expect(result!.next).toHaveBeenCalled();
    expect(result!.req.headers.device).toMatchObject({ id: 'test-device' });
  });

  it('parses a valid JSON-string device header into an object', () => {
    const { req, next } = run(JSON.stringify({ browser: 'chrome' }));
    expect(next).toHaveBeenCalled();
    expect(req.headers.device).toMatchObject({ browser: 'chrome' });
  });

  it('handles a missing device header without throwing', () => {
    let result: ReturnType<typeof run>;
    expect(() => (result = run(undefined))).not.toThrow();
    expect(result!.next).toHaveBeenCalled();
    expect(typeof result!.req.headers.device).toBe('object');
  });
});
