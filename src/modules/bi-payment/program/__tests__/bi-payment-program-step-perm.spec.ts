import 'reflect-metadata';
import { PERMISSION_META_KEY } from '@common/authorization/constants/authorization.constant';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { BiPaymentModule } from '../../bi-payment.module';
import { BiPaymentProgramController } from '../bi-payment-program.controller';
import { BiPaymentProgramStepController } from '../bi-payment-program-step.controller';

// Program-step perm mapping — edit gates all workstep PATCH paths, confirm gates pic-confirm-final-link.
describe('BiPaymentProgramStepController perm mapping', () => {
  const getPerm = (prop: string): string[] | undefined =>
    Reflect.getMetadata(PERMISSION_META_KEY, BiPaymentProgramStepController.prototype[prop]);

  it('nextStep gắn bp_program_edit', () => expect(getPerm('nextStep')).toEqual(['bp_program_edit']));
  it('updatePreparingWorkstep gắn bp_program_edit', () =>
    expect(getPerm('updatePreparingWorkstep')).toEqual(['bp_program_edit']));
  it('updateCalculatingWorkstep gắn bp_program_edit', () =>
    expect(getPerm('updateCalculatingWorkstep')).toEqual(['bp_program_edit']));
  it('updateReconciliationWorkstep gắn bp_program_edit', () =>
    expect(getPerm('updateReconciliationWorkstep')).toEqual(['bp_program_edit']));
  it('updateWaitingForApprovalWorkstep gắn bp_program_edit', () =>
    expect(getPerm('updateWaitingForApprovalWorkstep')).toEqual(['bp_program_edit']));
  it('picConfirmFinalLink gắn bp_program_confirm', () =>
    expect(getPerm('picConfirmFinalLink')).toEqual(['bp_program_confirm']));

  it('registers static step routes before the generic program :id routes', () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, BiPaymentModule) as unknown[];

    expect(controllers.indexOf(BiPaymentProgramStepController)).toBeLessThan(
      controllers.indexOf(BiPaymentProgramController),
    );
  });
});
