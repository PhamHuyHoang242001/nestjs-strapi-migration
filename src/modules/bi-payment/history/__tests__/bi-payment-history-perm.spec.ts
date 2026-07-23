import 'reflect-metadata';
import { PERMISSION_META_KEY } from '@common/authorization/constants/authorization.constant';
import { BiPaymentHistoryController } from '../bi-payment-history.controller';

// History/log-change perm mapping — program history/log = bp_program_view, project history = bp_project_view.
describe('BiPaymentHistoryController perm mapping', () => {
  const getPerm = (prop: string): string[] | undefined =>
    Reflect.getMetadata(PERMISSION_META_KEY, BiPaymentHistoryController.prototype[prop]);

  it('listProgramHistory gắn bp_program_view', () =>
    expect(getPerm('listProgramHistory')).toEqual(['bp_program_view']));
  it('getProgramHistoryDetail gắn bp_program_view', () =>
    expect(getPerm('getProgramHistoryDetail')).toEqual(['bp_program_view']));
  it('listProgramLogChange gắn bp_program_view', () =>
    expect(getPerm('listProgramLogChange')).toEqual(['bp_program_view']));
  it('listProjectHistory gắn bp_project_view', () =>
    expect(getPerm('listProjectHistory')).toEqual(['bp_project_view']));
});
