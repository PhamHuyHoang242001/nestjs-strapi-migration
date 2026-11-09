import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateDataServiceDto, DataServiceItSupportDto, toItSupport } from '../dto';

const errorsOf = async (itSupport: unknown): Promise<string[]> => {
  const dto = plainToInstance(CreateDataServiceDto, { it_support: itSupport });
  const errors = await validate(dto);
  const field = errors.find((e) => e.property === 'it_support');
  if (!field) return [];
  return [
    ...Object.keys(field.constraints ?? {}),
    ...(field.children ?? []).map((c) => `${c.property}:${Object.keys(c.constraints ?? {}).join(',')}`),
  ];
};

describe('data service it_support', () => {
  it('accepts any one contact method on its own', async () => {
    expect(await errorsOf({ email: 'a@vpbank.com.vn' })).toEqual([]);
    expect(await errorsOf({ phone: '0901.234.567' })).toEqual([]);
    expect(await errorsOf({ link: 'https://teams.microsoft.com/l/chat/0/0?users=a@vpbank.com.vn' })).toEqual([]);
    expect(await errorsOf({ link: 'https://zalo.me/g/abcxyz' })).toEqual([]);
  });

  it('needs at least one contact method (missing, empty object or blanks)', async () => {
    expect(await errorsOf(undefined)).toContain('hasItSupportContact');
    expect(await errorsOf({})).toContain('hasItSupportContact');
    expect(await errorsOf({ email: ' ; ', phone: '  ', link: '' })).toContain('hasItSupportContact');
  });

  it('email: `;`-separated, each part only needs an @; spacing is normalized', async () => {
    const dto = plainToInstance(DataServiceItSupportDto, { email: ' a@vpbank.com.vn ;b@x;; ' });
    expect(dto.email).toBe('a@vpbank.com.vn; b@x');
    expect(await errorsOf({ email: 'a@vpbank.com.vn; khong-co-a-cong' })).toEqual(['email:itSupportEmails']);
  });

  it('phone: `;`-separated, each with at least 7 digits (extension text allowed)', async () => {
    expect(await errorsOf({ phone: '024.3928.8888 (Ext: 8841); 0901234567' })).toEqual([]);
    expect(await errorsOf({ phone: '0901234567; 123' })).toEqual(['phone:itSupportPhones']);
  });

  it('link: only https://teams.microsoft.com or https://zalo.me, compared by origin', async () => {
    expect(await errorsOf({ link: 'https://Teams.Microsoft.com:443/l/chat/0/0' })).toEqual([]);
    for (const link of [
      'zalo.me/g/abc',
      'http://zalo.me/g/abc',
      'https://chat.zalo.me/g/abc',
      'https://teams.microsoft.com.evil.vn/x',
      'https://teams.microsoft.com@evil.vn/x',
      'https://portal.vpbank.com.vn/x',
    ]) {
      expect(await errorsOf({ link })).toEqual(['link:itSupportLink']);
    }
  });

  it('link: exactly one url', async () => {
    expect(await errorsOf({ link: 'https://zalo.me/g/a; https://zalo.me/g/b' })).toEqual(['link:itSupportLink']);
    expect(await errorsOf({ link: 'https://zalo.me/g/a https://zalo.me/g/b' })).toEqual(['link:itSupportLink']);
    expect(await errorsOf({ link: 'khong phai link' })).toEqual(['link:itSupportLink']);
  });

  it('is stored with every key present, null when not given', () => {
    expect(toItSupport({ email: 'a@x' })).toEqual({ email: 'a@x', phone: null, link: null });
    expect(toItSupport(null)).toBeNull();
  });
});
