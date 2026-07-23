import 'reflect-metadata';
import { PERMISSION_META_KEY } from '@common/authorization/constants/authorization.constant';
import { BiPaymentDocumentController } from '../bi-payment-document.controller';

// Document perm mapping — read gates view/upload/upload_recon; write gates are split by verb.
describe('BiPaymentDocumentController perm mapping', () => {
  const getPerm = (prop: string): string[] | undefined =>
    Reflect.getMetadata(PERMISSION_META_KEY, BiPaymentDocumentController.prototype[prop]);

  it('list gắn view/upload/upload_recon', () =>
    expect(getPerm('list')).toEqual(['bp_program_view', 'bp_program_upload', 'bp_program_upload_recon']));
  it('details gắn view/upload/upload_recon', () =>
    expect(getPerm('details')).toEqual(['bp_program_view', 'bp_program_upload', 'bp_program_upload_recon']));
  it('download gắn view/upload/upload_recon', () =>
    expect(getPerm('download')).toEqual(['bp_program_view', 'bp_program_upload', 'bp_program_upload_recon']));
  it('upload gắn upload/upload_recon', () =>
    expect(getPerm('upload')).toEqual(['bp_program_upload', 'bp_program_upload_recon']));
  it('updateStatus gắn upload/upload_recon/approve', () =>
    expect(getPerm('updateStatus')).toEqual(['bp_program_upload', 'bp_program_upload_recon', 'bp_program_approve']));
  it('merge gắn bp_program_upload', () => expect(getPerm('merge')).toEqual(['bp_program_upload']));
  it('getMergeStatus gắn bp_program_upload', () => expect(getPerm('getMergeStatus')).toEqual(['bp_program_upload']));
  it('downloadMerged gắn bp_program_upload', () => expect(getPerm('downloadMerged')).toEqual(['bp_program_upload']));
  it('stats gắn view/upload/upload_recon', () =>
    expect(getPerm('stats')).toEqual(['bp_program_view', 'bp_program_upload', 'bp_program_upload_recon']));
  it('uploadStatus gắn view/upload/upload_recon', () =>
    expect(getPerm('uploadStatus')).toEqual(['bp_program_view', 'bp_program_upload', 'bp_program_upload_recon']));
  it('userCreated gắn view/upload/upload_recon', () =>
    expect(getPerm('userCreated')).toEqual(['bp_program_view', 'bp_program_upload', 'bp_program_upload_recon']));
  it('userUpdated gắn view/upload/upload_recon', () =>
    expect(getPerm('userUpdated')).toEqual(['bp_program_view', 'bp_program_upload', 'bp_program_upload_recon']));
  it('userApproved gắn view/upload/upload_recon', () =>
    expect(getPerm('userApproved')).toEqual(['bp_program_view', 'bp_program_upload', 'bp_program_upload_recon']));
  it('userRejected gắn view/upload/upload_recon', () =>
    expect(getPerm('userRejected')).toEqual(['bp_program_view', 'bp_program_upload', 'bp_program_upload_recon']));
  it('delete route is removed', () => {
    expect(Object.getOwnPropertyNames(BiPaymentDocumentController.prototype)).not.toContain('delete');
  });
});
