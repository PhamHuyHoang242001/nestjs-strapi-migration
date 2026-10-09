import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateCoworkerPackageDto } from '../dto/create-coworker-package.dto';
import { CreateCoworkerVersionDto } from '../dto/create-coworker-version.dto';

const baseCreate = {
  code: 'CW-1',
  name: 'Bot',
  short_description: 'desc',
  publisher_id: 7,
  responsible_user_ids: [11],
  kind: 'personal',
  channel_ids: [1],
  model_id: 1,
  link: 'https://teams.microsoft.com/l/meetup-join/x',
};

const baseBump = {
  name: 'Bot v2',
  short_description: 'desc',
  publisher_id: 7,
  responsible_user_ids: [11],
  kind: 'personal',
  channel_ids: [1],
  model_id: 1,
  link: 'https://teams.microsoft.com/l/meetup-join/x',
  changelog_note: 'bump',
};

describe('coworker write DTOs', () => {
  it('create accepts a user-provided code', async () => {
    const errors = await validate(plainToInstance(CreateCoworkerPackageDto, baseCreate));
    expect(errors).toHaveLength(0);
  });

  it('create rejects empty code', async () => {
    const errors = await validate(plainToInstance(CreateCoworkerPackageDto, { ...baseCreate, code: '' }));
    expect(errors.some((e) => e.property === 'code')).toBe(true);
  });

  it('bump DTO has no code property', () => {
    expect(Object.prototype.hasOwnProperty.call(new CreateCoworkerVersionDto(), 'code')).toBe(false);
  });

  it('bump requires changelog_note', async () => {
    const errors = await validate(
      plainToInstance(CreateCoworkerVersionDto, {
        name: baseBump.name,
        short_description: baseBump.short_description,
        publisher_id: baseBump.publisher_id,
        responsible_user_ids: baseBump.responsible_user_ids,
        kind: baseBump.kind,
        channel_ids: baseBump.channel_ids,
        model_id: baseBump.model_id,
        link: baseBump.link,
      }),
    );
    expect(errors.some((e) => e.property === 'changelog_note')).toBe(true);
  });

  it('bump rejects unknown `code` when forbidNonWhitelisted is applied by the controller pipe', async () => {
    const errors = await validate(plainToInstance(CreateCoworkerVersionDto, { ...baseBump, code: 'steal' }), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(errors.some((e) => e.property === 'code')).toBe(true);
  });
});
