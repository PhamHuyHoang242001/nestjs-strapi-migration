import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { DataHubStatus } from '@modules/databases/data-hub-enums';
import { DataHubConsumerWriteService } from '../data-hub-consumer-write.service';
import { ConsumerSnapshot } from '../consumer-snapshot.util';
import { CreateConsumerDto, UpdateConsumerDto } from '../dto';

type Call = { sql: string; params: unknown[] };

const stored = {
  id: 9,
  code: 'CRM',
  name: 'CRM',
  category: 'INTERNAL_APP',
  division_id: 1,
  department_id: null,
  short_description: 'd',
  status: 'active',
  version_no: 3,
};

// Manager answers by SQL shape; every call is recorded for assertions.
function setup(opts: { current?: unknown; insertError?: Error; soRows?: unknown[] } = {}) {
  const calls: Call[] = [];
  const manager = {
    query: jest.fn((sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes('FROM data_hub_divisions') || sql.includes('FROM data_hub_departments'))
        return Promise.resolve([{ ok: 1 }]);
      if (/INSERT INTO data_hub_consumers\s/.test(sql)) {
        return opts.insertError ? Promise.reject(opts.insertError) : Promise.resolve([{ id: 9 }]);
      }
      if (sql.includes('FROM data_hub_consumer_business_contacts'))
        return Promise.resolve(opts.soRows ?? [{ consumer_id: 9, user_id: 1 }]);
      if (sql.includes('FOR UPDATE')) return Promise.resolve(opts.current === undefined ? [stored] : opts.current);
      return Promise.resolve([]);
    }),
  };
  const dataSource = { transaction: jest.fn((cb: (m: unknown) => unknown) => cb(manager)) };
  const userRefs = { assertUsers: jest.fn().mockResolvedValue(undefined) };
  const service = new DataHubConsumerWriteService(dataSource as never, userRefs as never);
  return { service, calls, userRefs };
}

const createDto = {
  code: 'CRM',
  name: 'CRM',
  category: 'INTERNAL_APP',
  division_id: 1,
  short_description: 'd',
  business_contact_user_ids: [1],
} as CreateConsumerDto;

const historyOf = (calls: Call[]) => calls.find((c) => c.sql.includes('data_hub_consumer_histories'));

describe('DataHubConsumerWriteService', () => {
  it('create inserts consumer v1 and a CREATE snapshot in the same transaction', async () => {
    const { service, calls, userRefs } = setup();
    const res = await service.create(createDto, 5);
    expect(res).toEqual({ id: 9, code: 'CRM', version_no: 1 });
    expect(userRefs.assertUsers).toHaveBeenCalledWith(expect.anything(), [1]);
    const h = historyOf(calls);
    expect(h?.params.slice(0, 3)).toEqual([9, 1, 'CREATE']);
    expect(JSON.parse(h?.params[3] as string)).toEqual({
      code: 'CRM',
      name: 'CRM',
      category: 'INTERNAL_APP',
      division_id: 1,
      department_id: null,
      short_description: 'd',
      status: 'active',
      business_contact_user_ids: [1],
    });
    expect(h?.params[4]).toBe(5);
  });

  it('create with several SOs validates all, links them in submitted order and snapshots sorted ids', async () => {
    const { service, calls, userRefs } = setup();
    await service.create({ ...createDto, business_contact_user_ids: [5, 2] } as CreateConsumerDto, 5);
    expect(userRefs.assertUsers).toHaveBeenCalledWith(expect.anything(), [5, 2]);
    const link = calls.find((c) => c.sql.includes('INSERT INTO data_hub_consumer_business_contacts'));
    expect(link?.params).toEqual([9, [5, 2]]);
    expect((JSON.parse(historyOf(calls)?.params[3] as string) as ConsumerSnapshot).business_contact_user_ids).toEqual([
      2, 5,
    ]);
  });

  it('create maps the live-code unique violation to 409 CONSUMER_CODE_EXISTS', async () => {
    const err = new QueryFailedError('q', [], {
      code: '23505',
      constraint: 'uq_data_hub_consumers_code_live',
    } as never);
    (err as unknown as { driverError: unknown }).driverError = {
      code: '23505',
      constraint: 'uq_data_hub_consumers_code_live',
    };
    const { service } = setup({ insertError: err });
    await expect(service.create(createDto, 5)).rejects.toBeInstanceOf(ConflictException);
  });

  it('create rejects an unknown division', async () => {
    const { service } = setup();
    const manager = (service as unknown as { dataSource: { transaction: jest.Mock } }).dataSource;
    manager.transaction.mockImplementationOnce((cb: (m: unknown) => unknown) =>
      cb({ query: () => Promise.resolve([]) }),
    );
    await expect(service.create(createDto, 5)).rejects.toThrow('INVALID_DIVISION');
  });

  it('update bumps version_no and writes an UPDATE snapshot keeping stored code/status', async () => {
    const { service, calls } = setup();
    const dto = { ...createDto, name: 'CRM v2' } as UpdateConsumerDto;
    const res = await service.update(9, dto, 5);
    expect(res).toEqual({ id: 9, version_no: 4 });
    const h = historyOf(calls);
    expect(h?.params.slice(0, 3)).toEqual([9, 4, 'UPDATE']);
    expect(JSON.parse(h?.params[3] as string)).toMatchObject({ code: 'CRM', name: 'CRM v2', status: 'active' });
  });

  it('update replaces the whole business-contact set (delete then insert) and snapshots the new ids', async () => {
    const { service, calls } = setup();
    await service.update(9, { ...createDto, business_contact_user_ids: [4, 2] } as UpdateConsumerDto, 5);
    const sqls = calls.map((c) => c.sql);
    const del = sqls.findIndex((s) => s.includes('DELETE FROM data_hub_consumer_business_contacts'));
    const ins = sqls.findIndex((s) => s.includes('INSERT INTO data_hub_consumer_business_contacts'));
    expect(del).toBeGreaterThan(-1);
    expect(ins).toBeGreaterThan(del);
    expect(calls[ins].params).toEqual([9, [4, 2]]);
    expect((JSON.parse(historyOf(calls)?.params[3] as string) as ConsumerSnapshot).business_contact_user_ids).toEqual([
      2, 4,
    ]);
  });

  it('update with the same business-contact set in a different order fails NO_CHANGES', async () => {
    const { service, calls } = setup({
      soRows: [
        { consumer_id: 9, user_id: 3 },
        { consumer_id: 9, user_id: 1 },
      ],
    });
    const dto = { ...createDto, business_contact_user_ids: [1, 3] } as UpdateConsumerDto;
    await expect(service.update(9, dto, 5)).rejects.toThrow('NO_CHANGES');
    expect(calls.some((c) => c.sql.includes('DELETE FROM data_hub_consumer_business_contacts'))).toBe(false);
  });

  it('update with identical data fails NO_CHANGES and writes nothing', async () => {
    const { service, calls } = setup();
    await expect(service.update(9, createDto, 5)).rejects.toThrow(new BadRequestException('NO_CHANGES'));
    expect(calls.some((c) => c.sql.includes('UPDATE data_hub_consumers'))).toBe(false);
    expect(historyOf(calls)).toBeUndefined();
  });

  it('update on a missing consumer is 404', async () => {
    const { service } = setup({ current: [] });
    await expect(service.update(9, createDto, 5)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('status toggle bumps version_no with a STATUS snapshot carrying the new status', async () => {
    const { service, calls } = setup();
    const res = await service.updateStatus(9, DataHubStatus.INACTIVE, 5);
    expect(res).toEqual({ id: 9, status: 'inactive', version_no: 4 });
    const h = historyOf(calls);
    expect(h?.params.slice(0, 3)).toEqual([9, 4, 'STATUS']);
    expect(JSON.parse(h?.params[3] as string)).toMatchObject({ status: 'inactive' });
  });

  it('same status fails NO_CHANGES', async () => {
    const { service } = setup();
    await expect(service.updateStatus(9, DataHubStatus.ACTIVE, 5)).rejects.toThrow('NO_CHANGES');
  });
});
