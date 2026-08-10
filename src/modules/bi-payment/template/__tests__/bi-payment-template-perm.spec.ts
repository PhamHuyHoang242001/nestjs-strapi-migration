import 'reflect-metadata';
import { PERMISSION_META_KEY } from '@common/authorization/constants/authorization.constant';
import { BiPaymentTemplateController } from '../bi-payment-template.controller';

// Template perm mapping — view/list and content routes are split from lifecycle verbs.
describe('BiPaymentTemplateController perm mapping', () => {
  const getPerm = (prop: string): string[] | undefined =>
    Reflect.getMetadata(PERMISSION_META_KEY, BiPaymentTemplateController.prototype[prop]);

  it('search gắn view/upload/upload_recon/content_view/template_create', () =>
    expect(getPerm('search')).toEqual([
      'bp_program_view',
      'bp_program_upload',
      'bp_program_upload_recon',
      'bp_program_content_view',
      'bp_template_create',
    ]));
  it('details gắn upload/upload_recon/content_view/template_create', () =>
    expect(getPerm('details')).toEqual([
      'bp_program_upload',
      'bp_program_upload_recon',
      'bp_program_content_view',
      'bp_template_create',
    ]));
  it('download gắn upload/upload_recon/content_view/template_create', () =>
    expect(getPerm('download')).toEqual([
      'bp_program_upload',
      'bp_program_upload_recon',
      'bp_program_content_view',
      'bp_template_create',
    ]));
  it('create gắn bp_template_create', () => expect(getPerm('create')).toEqual(['bp_template_create']));
  it('duplicateMany gắn bp_template_create', () => expect(getPerm('duplicateMany')).toEqual(['bp_template_create']));
  it('delete gắn bp_template_delete', () => expect(getPerm('delete')).toEqual(['bp_template_delete']));
  it('deleteMany gắn bp_template_delete', () => expect(getPerm('deleteMany')).toEqual(['bp_template_delete']));
  it('userCreated gắn view/upload/upload_recon', () =>
    expect(getPerm('userCreated')).toEqual(['bp_program_view', 'bp_program_upload', 'bp_program_upload_recon', 'bp_program_content_view']));
  it('userUpdated gắn view/upload/upload_recon', () =>
    expect(getPerm('userUpdated')).toEqual(['bp_program_view', 'bp_program_upload', 'bp_program_upload_recon', 'bp_program_content_view']));
});
