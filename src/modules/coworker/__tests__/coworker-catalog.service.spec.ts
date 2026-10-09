/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
import { CoworkerCatalogService } from '../coworker-catalog.service';

function makeQb() {
  const captured: string[] = [];
  const qb: any = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn((sql: string) => {
      captured.push(sql);
      return qb;
    }),
    andWhere: jest.fn((sql: string) => {
      captured.push(sql);
      return qb;
    }),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([{ id: 1, name: 'Microsoft Teams', is_deleted: false }]),
    captured,
  };
  return qb;
}

describe('CoworkerCatalogService', () => {
  it('lists live channels with dual-column soft-delete filter', async () => {
    const qb = makeQb();
    const channelRepo = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
    const modelRepo = { createQueryBuilder: jest.fn().mockReturnValue(makeQb()) };
    const service = new CoworkerCatalogService(channelRepo as never, modelRepo as never);

    const result = await service.listChannels();
    expect(result.data).toHaveLength(1);
    expect(qb.captured.join(' ')).toContain('deleted_at IS NULL');
    expect(qb.captured.join(' ')).toContain('is_deleted IS NOT TRUE');
  });

  it('lists live models with dual-column soft-delete filter', async () => {
    const qb = makeQb();
    const channelRepo = { createQueryBuilder: jest.fn().mockReturnValue(makeQb()) };
    const modelRepo = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
    const service = new CoworkerCatalogService(channelRepo as never, modelRepo as never);

    await service.listModels();
    expect(qb.captured.join(' ')).toContain('deleted_at IS NULL');
    expect(qb.captured.join(' ')).toContain('is_deleted IS NOT TRUE');
  });
});
