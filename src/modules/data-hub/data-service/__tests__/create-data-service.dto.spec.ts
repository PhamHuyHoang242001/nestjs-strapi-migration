import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateDataServiceDto } from '../dto/create-data-service.dto';
import { DataServiceTermInputDto } from '../dto/data-service-source-table.dto';
import { UpdateDataServiceDto } from '../dto/update-data-service.dto';

const ids = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
const consumerErrors = (cls: new () => object, n: number) =>
  validateSync(plainToInstance(cls, { consumer_ids: ids(n) })).filter((e) => e.property === 'consumer_ids');

describe('consumer_ids limit of the data-service form', () => {
  it.each([CreateDataServiceDto, UpdateDataServiceDto])('%p accepts 1..20 consumers, rejects 0 and 21', (cls) => {
    expect(consumerErrors(cls, 1)).toEqual([]);
    expect(consumerErrors(cls, 20)).toEqual([]);
    expect(consumerErrors(cls, 0)).toHaveLength(1);
    expect(consumerErrors(cls, 21)).toHaveLength(1);
  });
});

describe('usage_guide_html of the data-service form', () => {
  const guideErrors = (cls: new () => object, guide: unknown) =>
    validateSync(plainToInstance(cls, guide === undefined ? {} : { usage_guide_html: guide })).filter(
      (e) => e.property === 'usage_guide_html',
    );

  it.each([CreateDataServiceDto, UpdateDataServiceDto])('%p accepts a missing or empty guide', (cls) => {
    expect(guideErrors(cls, undefined)).toEqual([]);
    expect(guideErrors(cls, '')).toEqual([]);
    expect(guideErrors(cls, '<p>x</p>')).toEqual([]);
    expect(guideErrors(cls, 123)).toHaveLength(1);
  });
});

describe('SO dịch vụ of the data-service form', () => {
  const ownerErrors = (cls: new () => object, value: unknown) =>
    validateSync(plainToInstance(cls, value === undefined ? {} : { service_owner_user_ids: value })).filter(
      (e) => e.property === 'service_owner_user_ids',
    );

  it.each([CreateDataServiceDto, UpdateDataServiceDto])('%p requires 1..50 distinct users', (cls) => {
    expect(ownerErrors(cls, [1, 2])).toEqual([]);
    expect(ownerErrors(cls, ids(50))).toEqual([]);
    expect(ownerErrors(cls, undefined)).toHaveLength(1);
    expect(ownerErrors(cls, [])).toHaveLength(1);
    expect(ownerErrors(cls, ids(51))).toHaveLength(1);
    expect(ownerErrors(cls, [1, 1])).toHaveLength(1);
  });
});

describe('physical term Data Type / Required', () => {
  const termErrors = (term: Record<string, unknown>) =>
    validateSync(plainToInstance(DataServiceTermInputDto, { code: 'c', technical_description: 'd', ...term })).map(
      (e) => e.property,
    );

  it('requires a Data Type (≤100) and takes an optional boolean Required', () => {
    expect(termErrors({ data_type: 'VARCHAR(20)' })).toEqual([]);
    expect(termErrors({ data_type: 'NUMBER', is_required: true })).toEqual([]);
    expect(termErrors({})).toEqual(['data_type']);
    expect(termErrors({ data_type: '  ' })).toEqual(['data_type']);
    expect(termErrors({ data_type: 'x'.repeat(101) })).toEqual(['data_type']);
    expect(termErrors({ data_type: 'NUMBER', is_required: 'yes' })).toEqual(['is_required']);
  });
});
