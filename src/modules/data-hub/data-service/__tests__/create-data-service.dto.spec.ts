import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateDataServiceDto } from '../dto/create-data-service.dto';
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
