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
  channels: [{ channel_id: 1, link: 'https://teams.microsoft.com/l/meetup-join/x' }],
  model_id: 1,
};

const baseBump = {
  name: 'Bot v2',
  short_description: 'desc',
  publisher_id: 7,
  responsible_user_ids: [11],
  kind: 'personal',
  channels: [{ channel_id: 1, link: 'https://teams.microsoft.com/l/meetup-join/x' }],
  model_id: 1,
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
        channels: baseBump.channels,
        model_id: baseBump.model_id,
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

  describe('channels (one link per channel)', () => {
    const strict = { whitelist: true, forbidNonWhitelisted: true };

    it('accepts several channel/link pairs', async () => {
      const channels = [
        { channel_id: 1, link: 'https://teams.microsoft.com/l/x' },
        { channel_id: 2, link: 'https://zalo.me/g/abc' },
      ];
      expect(await validate(plainToInstance(CreateCoworkerPackageDto, { ...baseCreate, channels }), strict)).toHaveLength(0);
      expect(await validate(plainToInstance(CreateCoworkerVersionDto, { ...baseBump, channels }), strict)).toHaveLength(0);
    });

    it.each([
      ['missing', undefined],
      ['empty', []],
      ['duplicate channel_id', [
        { channel_id: 1, link: 'https://teams.microsoft.com/l/a' },
        { channel_id: 1, link: 'https://teams.microsoft.com/l/b' },
      ]],
      ['item with bad channel_id', [{ channel_id: 0, link: 'https://teams.microsoft.com/l/a' }]],
    ])('rejects channels %s', async (_label, channels) => {
      const errors = await validate(plainToInstance(CreateCoworkerPackageDto, { ...baseCreate, channels }), strict);
      expect(errors.some((e) => e.property === 'channels')).toBe(true);
    });

    it.each([
      ['omitted', { channel_id: 1 }],
      ['null', { channel_id: 1, link: null }],
      ['empty', { channel_id: 1, link: '' }],
    ])('link is optional (%s)', async (_label, item) => {
      const errors = await validate(
        plainToInstance(CreateCoworkerPackageDto, { ...baseCreate, channels: [item] }),
        strict,
      );
      expect(errors).toHaveLength(0);
    });

    it('rejects a non-string link', async () => {
      const errors = await validate(
        plainToInstance(CreateCoworkerPackageDto, { ...baseCreate, channels: [{ channel_id: 1, link: 123 }] }),
        strict,
      );
      expect(errors.some((e) => e.property === 'channels')).toBe(true);
    });

    it('rejects an unknown property inside a channel item', async () => {
      const channels = [{ channel_id: 1, link: 'https://teams.microsoft.com/l/a', extra: 1 }];
      const errors = await validate(plainToInstance(CreateCoworkerVersionDto, { ...baseBump, channels }), strict);
      expect(errors.some((e) => e.property === 'channels')).toBe(true);
    });

    it.each(['channel_ids', 'link'])('rejects the removed top-level `%s` field', async (field) => {
      const extra = field === 'link' ? { link: 'https://teams.microsoft.com/l/x' } : { channel_ids: [1] };
      const errors = await validate(plainToInstance(CreateCoworkerPackageDto, { ...baseCreate, ...extra }), strict);
      expect(errors.some((e) => e.property === field)).toBe(true);
    });
  });
});
