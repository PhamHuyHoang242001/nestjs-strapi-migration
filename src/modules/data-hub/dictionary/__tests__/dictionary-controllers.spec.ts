import { ForbiddenException } from '@nestjs/common';
import { LogicalTermController } from '../logical-term.controller';
import { PhysicalTermController } from '../physical-term.controller';
import { SourceTableController } from '../source-table.controller';

const noUser = { info: {} } as never;
const withUser = { info: { user: { id: 3 } } } as never;

describe('Dictionary controllers auth', () => {
  const logical = new LogicalTermController(
    { list: jest.fn().mockResolvedValue('ok'), stats: jest.fn(), systemsOut: jest.fn(), getById: jest.fn() } as never,
    { create: jest.fn().mockResolvedValue('created'), update: jest.fn() } as never,
    { list: jest.fn() } as never,
    { buildRows: jest.fn() } as never,
    { hasCode: jest.fn().mockResolvedValue(true) } as never,
  );
  const physical = new PhysicalTermController(
    { available: jest.fn().mockResolvedValue('avail') } as never,
    { getById: jest.fn().mockResolvedValue({ id: 1 }) } as never,
  );
  const tables = new SourceTableController({
    list: jest.fn().mockResolvedValue('list'),
    selectable: jest.fn().mockResolvedValue('sel'),
    terms: jest.fn().mockResolvedValue('terms'),
  } as never);

  it('rejects requests without an authenticated user', () => {
    expect(() => logical.list({} as never, noUser)).toThrow(ForbiddenException);
    expect(() => logical.create({} as never, noUser)).toThrow('User not authenticated');
    expect(() => physical.available({} as never, noUser)).toThrow(ForbiddenException);
    expect(() => physical.getById(1, noUser)).toThrow(ForbiddenException);
    expect(() => tables.list({} as never, noUser)).toThrow(ForbiddenException);
    expect(() => tables.selectable({} as never, noUser)).toThrow(ForbiddenException);
    expect(() => tables.terms(1, noUser)).toThrow(ForbiddenException);
  });

  it('delegates for a logged-in user', async () => {
    await expect(logical.list({} as never, withUser)).resolves.toBe('ok');
    await expect(logical.create({} as never, withUser)).resolves.toBe('created');
    await expect(physical.available({} as never, withUser)).resolves.toBe('avail');
    await expect(physical.getById(1, withUser)).resolves.toEqual({ id: 1 });
    await expect(tables.list({} as never, withUser)).resolves.toBe('list');
    await expect(tables.selectable({} as never, withUser)).resolves.toBe('sel');
    await expect(tables.terms(4, withUser)).resolves.toBe('terms');
  });
});
