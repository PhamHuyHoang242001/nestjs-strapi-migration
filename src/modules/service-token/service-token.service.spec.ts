import { JWT_TOKEN_TYPE } from '@modules/databases/jwt-token.entity';
import { ServiceTokenService } from './service-token.service';

describe('ServiceTokenService', () => {
  const jwtTokenRepository = {
    save: jest.fn(),
    findActiveServiceToken: jest.fn(),
  };

  const service = new ServiceTokenService(jwtTokenRepository as any);

  beforeEach(() => jest.clearAllMocks());

  describe('generateServiceToken', () => {
    it('returns {serviceToken, type} and calls repository.save once with correct fields', async () => {
      jwtTokenRepository.save.mockResolvedValue({ id: 1 });

      const result = await service.generateServiceToken({ type: 'api-service', id: 'svc-001' }, 42);

      // Verify repository.save was called exactly once
      expect(jwtTokenRepository.save).toHaveBeenCalledTimes(1);

      // Verify the saved object has correct structure
      const savedObj = jwtTokenRepository.save.mock.calls[0][0];
      expect(savedObj).toMatchObject({
        type: JWT_TOKEN_TYPE.SERVICE_TOKEN,
        is_delete: false,
        name: 'svc-001',
        created_by: 42,
      });

      // Verify token is a non-empty string
      expect(typeof savedObj.token).toBe('string');
      expect(savedObj.token.length).toBeGreaterThan(0);

      // Verify return shape
      expect(result).toEqual({
        serviceToken: expect.any(String),
        type: JWT_TOKEN_TYPE.SERVICE_TOKEN,
      });
    });

    it('generates a valid JWT payload containing {id, type, sub}', async () => {
      jwtTokenRepository.save.mockResolvedValue({ id: 1 });

      await service.generateServiceToken({ type: 'api-service', id: 'svc-001' });

      const savedObj = jwtTokenRepository.save.mock.calls[0][0];
      const token = savedObj.token;

      // Decode JWT without verifying signature (base64 decode)
      const [, payload] = token.split('.');
      const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));

      expect(decoded).toMatchObject({
        id: 'svc-001',
        type: 'api-service',
        sub: 'svc-001',
      });
    });
  });

  describe('verifyServiceToken', () => {
    it('returns parsed JWT when repository.findActiveServiceToken resolves a row', async () => {
      jwtTokenRepository.findActiveServiceToken.mockResolvedValue({ id: 1, token: 'valid-token' });

      // Create a valid JWT manually
      const jwt = require('jsonwebtoken');
      const validToken = jwt.sign({ id: 'svc-001', type: 'api-service', sub: 'svc-001' }, 'secret');

      const result = await service.verifyServiceToken(validToken);

      expect(result).toEqual({
        header: expect.any(Object),
        payload: expect.objectContaining({
          id: 'svc-001',
          type: 'api-service',
          sub: 'svc-001',
        }),
        signature: expect.any(String),
      });
    });

    it('returns null when repository.findActiveServiceToken resolves undefined', async () => {
      jwtTokenRepository.findActiveServiceToken.mockResolvedValue(undefined);

      const jwt = require('jsonwebtoken');
      const token = jwt.sign({ id: 'svc-001' }, 'secret');

      const result = await service.verifyServiceToken(token);

      expect(result).toBeNull();
    });

    it('returns null for a malformed token string', async () => {
      jwtTokenRepository.findActiveServiceToken.mockResolvedValue({ id: 1 });

      const result = await service.verifyServiceToken('not-a-valid-jwt');

      expect(result).toBeNull();
      expect(jwtTokenRepository.findActiveServiceToken).not.toHaveBeenCalled();
    });

    it('returns null for an empty token string', async () => {
      const result = await service.verifyServiceToken('');

      expect(result).toBeNull();
      expect(jwtTokenRepository.findActiveServiceToken).not.toHaveBeenCalled();
    });
  });
});
