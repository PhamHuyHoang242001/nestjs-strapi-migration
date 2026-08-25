import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListApiQueryDto } from '../list-api-query.dto';

// Twin of the skill list DTO. Global whitelist strips leftover tag_ids / kind before the
// controller pipe, so HTTP does not 400; the DTO itself still has no such properties.
describe('ListApiQueryDto — list has no tag_ids / kind', () => {
  const parse = async (raw: Record<string, unknown>) => {
    const dto = plainToInstance(ListApiQueryDto, raw, { enableImplicitConversion: false });
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    return { dto, errors };
  };

  it('accepts search + category + publisher', async () => {
    const { dto, errors } = await parse({ search: 'Báo', category_id: '2', publisher_id: '4' });
    expect(errors).toHaveLength(0);
    expect(dto.search).toBe('Báo');
    expect(dto.category_id).toBe(2);
    expect(dto.publisher_id).toBe(4);
  });

  it('rejects leftover tag_ids as a non-whitelisted property', async () => {
    const { errors } = await parse({ tag_ids: '3,4' });
    const hit = errors.find((e) => e.property === 'tag_ids');
    expect(hit).toBeDefined();
    expect(hit?.constraints).toBeDefined();
  });

  it('rejects leftover kind as a non-whitelisted property', async () => {
    const { errors } = await parse({ kind: 'personal' });
    const hit = errors.find((e) => e.property === 'kind');
    expect(hit).toBeDefined();
    expect(hit?.constraints).toBeDefined();
  });
});
