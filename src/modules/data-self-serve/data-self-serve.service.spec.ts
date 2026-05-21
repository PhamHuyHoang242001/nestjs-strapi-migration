import { ForbiddenException } from '@nestjs/common';
import { DataSelfServeService } from './data-self-serve.service';

describe('DataSelfServeService', () => {
  const requestRepo = { findOne: jest.fn(), create: jest.fn((v) => v), save: jest.fn() };
  const logRepo = {};
  const branchRepo = { find: jest.fn() };
  const segmentRepo = { find: jest.fn() };
  const industryRepo = { find: jest.fn() };
  const centerRepo = { findOne: jest.fn() };
  const userRepo = { findOne: jest.fn() };
  const quota = { consume: jest.fn(), getRemaining: jest.fn() };
  const emitter = { emit: jest.fn() };
  const service = new DataSelfServeService(
    requestRepo as any,
    logRepo as any,
    branchRepo as any,
    segmentRepo as any,
    industryRepo as any,
    centerRepo as any,
    userRepo as any,
    quota as any,
    emitter as any,
  );

  beforeEach(() => jest.clearAllMocks());

  it('rejects detail access when request creator differs from current user', async () => {
    requestRepo.findOne.mockResolvedValue({ id: 1, created_by_user_id: 99 });
    await expect(service.findOneRequest(1, 7)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns request config from branch, segment, and industry repositories', async () => {
    branchRepo.find.mockResolvedValue([{ id: 1, branch_code: '001', branch_name: 'HN' }]);
    segmentRepo.find.mockResolvedValue([{ id: 2, seg_code: 'SME' }]);
    industryRepo.find.mockResolvedValue([{ id: 3, industry_code: 'BANK' }]);
    await expect(service.getRequestConfig()).resolves.toEqual({
      data: {
        bookCodes: [{ id: 1, branch_code: '001', branch_name: 'HN' }],
        segments: [{ id: 2, code: 'SME' }],
        industries: [{ id: 3, code: 'BANK' }],
      },
    });
  });
});
