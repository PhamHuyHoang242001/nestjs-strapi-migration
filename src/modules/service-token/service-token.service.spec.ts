import { NotFoundException } from '@nestjs/common';
import { JWT_TOKEN_TYPE } from '@modules/databases/jwt-token.entity';
import { ServiceTokenService } from './service-token.service';
import * as commonUtils from '@common/utils/common';

jest.mock('@common/utils/common', () => ({
  execQueryPaignation: jest.fn(),
  execQueryAll: jest.fn(),
}));

describe('ServiceTokenService', () => {
  const jwtTokenRepository = {
    save: jest.fn(),
    findActiveServiceToken: jest.fn(),
    findActiveServiceTokenById: jest.fn(),
    buildServiceTokenListQuery: jest.fn(),
    updateOne: jest.fn(),
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

  describe('search', () => {
    const sortParams = { sort_field: 'id', sort_order: 'DESC' } as any;

    it('builds the list query and delegates to execQueryPaignation when limit != -1', async () => {
      const qb = { fake: 'qb' };
      jwtTokenRepository.buildServiceTokenListQuery.mockReturnValue(qb);
      (commonUtils.execQueryPaignation as jest.Mock).mockResolvedValue({ data: [], meta: {} });

      const result = await service.search({ name: 'svc' }, sortParams, { page: 1, limit: 10 });

      expect(jwtTokenRepository.buildServiceTokenListQuery).toHaveBeenCalledWith({ name: 'svc' }, sortParams);
      expect(commonUtils.execQueryPaignation).toHaveBeenCalledWith(qb, 1, 10);
      expect(commonUtils.execQueryAll).not.toHaveBeenCalled();
      expect(result).toEqual({ data: [], meta: {} });
    });

    it('uses execQueryAll when limit === -1', async () => {
      const qb = { fake: 'qb' };
      jwtTokenRepository.buildServiceTokenListQuery.mockReturnValue(qb);
      (commonUtils.execQueryAll as jest.Mock).mockResolvedValue({ data: [], meta: {} });

      await service.search({}, sortParams, { page: 1, limit: -1 });

      expect(commonUtils.execQueryAll).toHaveBeenCalledWith(qb);
      expect(commonUtils.execQueryPaignation).not.toHaveBeenCalled();
    });
  });

  describe('details', () => {
    it('returns the active token (including token value) when found', async () => {
      const row = { id: 5, name: 'svc', token: 'jwt-value', type: JWT_TOKEN_TYPE.SERVICE_TOKEN };
      jwtTokenRepository.findActiveServiceTokenById.mockResolvedValue(row);

      const result = await service.details(5);

      expect(jwtTokenRepository.findActiveServiceTokenById).toHaveBeenCalledWith(5);
      expect(result).toBe(row);
    });

    it('throws NotFoundException when the token is missing/deleted/wrong type', async () => {
      jwtTokenRepository.findActiveServiceTokenById.mockResolvedValue(undefined);

      await expect(service.details(999)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateName', () => {
    it('updates only name (+ updated_by) for an active token', async () => {
      jwtTokenRepository.findActiveServiceTokenById.mockResolvedValue({ id: 5 });

      const result = await service.updateName(5, 'new-name', 42);

      expect(jwtTokenRepository.updateOne).toHaveBeenCalledTimes(1);
      expect(jwtTokenRepository.updateOne).toHaveBeenCalledWith(
        { id: 5, type: JWT_TOKEN_TYPE.SERVICE_TOKEN, is_delete: false },
        { name: 'new-name', updated_by: 42 },
      );
      expect(result).toEqual({ id: 5, name: 'new-name' });
    });

    it('throws NotFoundException and does not update when token is missing', async () => {
      jwtTokenRepository.findActiveServiceTokenById.mockResolvedValue(undefined);

      await expect(service.updateName(999, 'x', 1)).rejects.toBeInstanceOf(NotFoundException);
      expect(jwtTokenRepository.updateOne).not.toHaveBeenCalled();
    });
  });

  describe('softDelete', () => {
    it('sets is_delete=true (type-scoped) and returns {id} for an active token', async () => {
      jwtTokenRepository.findActiveServiceTokenById.mockResolvedValue({ id: 5 });

      const result = await service.softDelete(5, 42);

      expect(jwtTokenRepository.updateOne).toHaveBeenCalledWith(
        { id: 5, type: JWT_TOKEN_TYPE.SERVICE_TOKEN },
        { is_delete: true, updated_by: 42 },
      );
      expect(result).toEqual({ id: 5 });
    });

    it('throws NotFoundException and does not update when token is missing/already deleted', async () => {
      jwtTokenRepository.findActiveServiceTokenById.mockResolvedValue(undefined);

      await expect(service.softDelete(999, 1)).rejects.toBeInstanceOf(NotFoundException);
      expect(jwtTokenRepository.updateOne).not.toHaveBeenCalled();
    });
  });
});
