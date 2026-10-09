/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CoworkerQueryService } from '../coworker-query.service';
import { CoworkerPackageStatus } from '@modules/databases/coworker-package.entity';
import { CoworkerVersionState } from '@modules/databases/coworker-version.entity';

const USER_ID = 10;
const OTHER_USER_ID = 20;
const PACKAGE_ID = 1;
const VERSION_ID = 5;

function makeQueryBuilder(resultRows: unknown[] = [], countValue = '0') {
  const capturedWheres: string[] = [];
  const capturedParams: Record<string, unknown> = {};
  const qb: any = {
    innerJoin: jest.fn().mockReturnThis(),
    innerJoinAndMapOne: jest.fn().mockReturnThis(),
    where: jest.fn((sql: string, p?: Record<string, unknown>) => {
      capturedWheres.push(sql);
      if (p) Object.assign(capturedParams, p);
      return qb;
    }),
    andWhere: jest.fn((sql: string, p?: Record<string, unknown>) => {
      capturedWheres.push(sql);
      if (p) Object.assign(capturedParams, p);
      return qb;
    }),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(resultRows),
    getRawOne: jest.fn().mockResolvedValue({ count: countValue }),
    capturedWheres,
    capturedParams,
  };
  return qb;
}

function makeMetaRead() {
  return {
    getResponsiblesByPackageIds: jest.fn().mockResolvedValue(new Map()),
    getPublishersByIds: jest.fn().mockResolvedValue(new Map()),
    getSupportersByPackageIds: jest.fn().mockResolvedValue(new Map()),
    listSupportedPackageIds: jest.fn().mockResolvedValue([]),
  };
}

describe('CoworkerQueryService', () => {
  let service: CoworkerQueryService;
  let packageRepo: any;
  let versionRepo: any;
  let permissionQuery: any;
  let metaRead: any;

  beforeEach(() => {
    jest.clearAllMocks();
    permissionQuery = { getUserPermissions: jest.fn().mockResolvedValue([]) };
    packageRepo = { createQueryBuilder: jest.fn(), findOne: jest.fn() };
    versionRepo = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      manager: { query: jest.fn().mockResolvedValue([]) },
    };
    metaRead = makeMetaRead();
    service = new CoworkerQueryService(packageRepo, versionRepo, permissionQuery, metaRead);
  });

  it('list defaults to active packages for Bearer callers', async () => {
    const qb = makeQueryBuilder();
    packageRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);
    await service.list({ page: 1, limit: 10 }, USER_ID);
    expect(qb.capturedParams.status).toBe(CoworkerPackageStatus.ACTIVE);
  });

  it('detail isUpdate is true only when canBump (upload + creator/supporter)', async () => {
    packageRepo.findOne.mockResolvedValue({
      id: PACKAGE_ID,
      created_by: USER_ID,
      status: CoworkerPackageStatus.ACTIVE,
      is_deleted: false,
      publisher_id: 1,
      active_version_id: VERSION_ID,
      active_version: { id: VERSION_ID, submitted_by: USER_ID, model_id: 1 },
    });
    permissionQuery.getUserPermissions.mockResolvedValue(['coworker_upload']);
    const result = await service.detail(PACKAGE_ID, USER_ID);
    expect(result.isUpdate).toBe(true);
  });

  it('detail isUpdate is false for approve-only stranger', async () => {
    packageRepo.findOne.mockResolvedValue({
      id: PACKAGE_ID,
      created_by: OTHER_USER_ID,
      status: CoworkerPackageStatus.ACTIVE,
      is_deleted: false,
      publisher_id: 1,
      active_version_id: VERSION_ID,
      active_version: { id: VERSION_ID, submitted_by: OTHER_USER_ID, model_id: 1 },
    });
    permissionQuery.getUserPermissions.mockResolvedValue(['coworker_approve']);
    const result = await service.detail(PACKAGE_ID, USER_ID);
    expect(result.isUpdate).toBe(false);
  });

  it('inactive detail 404s for a stranger without approve', async () => {
    packageRepo.findOne.mockResolvedValue({
      id: PACKAGE_ID,
      created_by: OTHER_USER_ID,
      status: CoworkerPackageStatus.INACTIVE,
      is_deleted: false,
      publisher_id: 1,
    });
    await expect(service.detail(PACKAGE_ID, USER_ID)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('versionDetail forbids a stranger without approve', async () => {
    versionRepo.findOne.mockResolvedValue({
      id: VERSION_ID,
      coworker_package_id: PACKAGE_ID,
      submitted_by: OTHER_USER_ID,
      is_deleted: false,
      state: CoworkerVersionState.APPROVED,
    });
    packageRepo.findOne.mockResolvedValue({ id: PACKAGE_ID, created_by: OTHER_USER_ID, is_deleted: false });
    await expect(service.versionDetail(VERSION_ID, USER_ID)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
