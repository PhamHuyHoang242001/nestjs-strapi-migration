import 'reflect-metadata';
import { PERMISSION_META_KEY } from '@common/authorization/constants/authorization.constant';
import { BiPaymentOtherFileController } from '../bi-payment-other-file.controller';

// Other-file perm mapping — all endpoints gắn bp_program_preparing (màn Chuẩn bị).
describe('BiPaymentOtherFileController perm mapping', () => {
  const getPerm = (prop: string): string[] | undefined =>
    Reflect.getMetadata(PERMISSION_META_KEY, BiPaymentOtherFileController.prototype, prop);

  it('search gắn bp_program_preparing', () => expect(getPerm('search')).toEqual(['bp_program_preparing']));
  it('userCreated gắn bp_program_preparing', () => expect(getPerm('userCreated')).toEqual(['bp_program_preparing']));
  it('upload gắn bp_program_preparing', () => expect(getPerm('upload')).toEqual(['bp_program_preparing']));
  it('delete gắn bp_program_preparing', () => expect(getPerm('delete')).toEqual(['bp_program_preparing']));
  it('downloadMultiple gắn bp_program_preparing', () =>
    expect(getPerm('downloadMultiple')).toEqual(['bp_program_preparing']));
});
