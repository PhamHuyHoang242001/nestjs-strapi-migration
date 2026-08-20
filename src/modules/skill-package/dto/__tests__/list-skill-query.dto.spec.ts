import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListSkillQueryDto } from '../list-skill-query.dto';

// List matching is keyword-only. tag_ids / kind used to be discrete filters.
// Global ValidationPipe (whitelist, no forbid) strips unknown keys before the controller
// pipe, so leftover clients keep working — they just stop AND-filtering. These specs lock
// the DTO surface itself: the class has no such properties.
describe('ListSkillQueryDto — list has no tag_ids / kind', () => {
  const parse = async (raw: Record<string, unknown>) => {
    const dto = plainToInstance(ListSkillQueryDto, raw, { enableImplicitConversion: false });
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
    const { errors } = await parse({ kind: 'enterprise' });
    const hit = errors.find((e) => e.property === 'kind');
    expect(hit).toBeDefined();
    expect(hit?.constraints).toBeDefined();
  });
});
