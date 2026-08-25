import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListVersionsDto } from '../list-versions.dto';

// The FE sends the package filter as a comma-separated id string (e.g. "1,2,3"); the DTO @Transform
// must normalize it into a number[] so the service can bind `p.id = ANY($n)`. These lock that contract
// plus its boundary behavior (single value, bracket-array, whitespace, invalid-token rejection).
describe('prompt ListVersionsDto — api_catalog_package_id transform (comma string → number[])', () => {
  const parse = async (raw: Record<string, unknown>) => {
    const dto = plainToInstance(ListVersionsDto, raw, { enableImplicitConversion: false });
    const errors = await validate(dto, { whitelist: true });
    return { dto, errors };
  };

  it('comma string "1,2,3" → [1,2,3]', async () => {
    const { dto, errors } = await parse({ api_catalog_package_id: '1,2,3' });
    expect(dto.api_catalog_package_id).toEqual([1, 2, 3]);
    expect(errors).toHaveLength(0);
  });

  it('trims whitespace: " 1 , 2 ,3 " → [1,2,3]', async () => {
    const { dto } = await parse({ api_catalog_package_id: ' 1 , 2 ,3 ' });
    expect(dto.api_catalog_package_id).toEqual([1, 2, 3]);
  });

  it('single value "5" → [5]', async () => {
    const { dto, errors } = await parse({ api_catalog_package_id: '5' });
    expect(dto.api_catalog_package_id).toEqual([5]);
    expect(errors).toHaveLength(0);
  });

  it('repeated/bracket-array form ["1","2"] → [1,2]', async () => {
    const { dto, errors } = await parse({ api_catalog_package_id: ['1', '2'] });
    expect(dto.api_catalog_package_id).toEqual([1, 2]);
    expect(errors).toHaveLength(0);
  });

  it('rejects mixed non-numeric and non-positive tokens', async () => {
    const { dto, errors } = await parse({ api_catalog_package_id: '1,abc,-3,0,4' });
    expect(dto.api_catalog_package_id).toEqual([1, NaN, -3, 0, 4]);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects an all-junk filter instead of widening to an unfiltered query', async () => {
    const { dto, errors } = await parse({ api_catalog_package_id: 'abc,xyz' });
    expect(dto.api_catalog_package_id).toEqual([NaN, NaN]);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('omitted → undefined (no filter)', async () => {
    const { dto, errors } = await parse({ state: 'all' });
    expect(dto.api_catalog_package_id).toBeUndefined();
    expect(errors).toHaveLength(0);
  });

  it('empty string → undefined (no filter)', async () => {
    const { dto } = await parse({ api_catalog_package_id: '' });
    expect(dto.api_catalog_package_id).toBeUndefined();
  });
});
