import { BiPaymentWorkstepCurrent } from '@common/enums/bi-payment.enums';
import { isValidTransition, WORKSTEP_TRANSITIONS } from '../constants/workstep-transition';

// Pure-function transition map — assert every valid + invalid hop.
describe('bi-payment workstep transition map', () => {
  it('allows each forward step in the happy path', () => {
    expect(isValidTransition(BiPaymentWorkstepCurrent.CREATE_A_PROGRAM, BiPaymentWorkstepCurrent.PREPARING)).toBe(true);
    expect(isValidTransition(BiPaymentWorkstepCurrent.PREPARING, BiPaymentWorkstepCurrent.CALCULATING)).toBe(true);
    expect(isValidTransition(BiPaymentWorkstepCurrent.CALCULATING, BiPaymentWorkstepCurrent.RECONCILIATION)).toBe(true);
    expect(isValidTransition(BiPaymentWorkstepCurrent.RECONCILIATION, BiPaymentWorkstepCurrent.WAITING_FOR_APPROVAL)).toBe(true);
    expect(isValidTransition(BiPaymentWorkstepCurrent.WAITING_FOR_APPROVAL, BiPaymentWorkstepCurrent.RELEASE)).toBe(true);
  });

  it('allows exception → preparing (vòng mới)', () => {
    expect(isValidTransition(BiPaymentWorkstepCurrent.EXCEPTION, BiPaymentWorkstepCurrent.PREPARING)).toBe(true);
  });

  it('rejects backward / skip-ahead transitions', () => {
    // Backward
    expect(isValidTransition(BiPaymentWorkstepCurrent.CALCULATING, BiPaymentWorkstepCurrent.PREPARING)).toBe(false);
    expect(isValidTransition(BiPaymentWorkstepCurrent.RECONCILIATION, BiPaymentWorkstepCurrent.CALCULATING)).toBe(false);
    // Skip ahead
    expect(isValidTransition(BiPaymentWorkstepCurrent.PREPARING, BiPaymentWorkstepCurrent.RELEASE)).toBe(false);
    expect(isValidTransition(BiPaymentWorkstepCurrent.CREATE_A_PROGRAM, BiPaymentWorkstepCurrent.RELEASE)).toBe(false);
  });

  it('treats RELEASE as terminal (no outbound hops)', () => {
    expect(WORKSTEP_TRANSITIONS[BiPaymentWorkstepCurrent.RELEASE]).toEqual([]);
    expect(isValidTransition(BiPaymentWorkstepCurrent.RELEASE, BiPaymentWorkstepCurrent.PREPARING)).toBe(false);
  });

  it('exception can only go back to preparing, not forward to calculating', () => {
    expect(isValidTransition(BiPaymentWorkstepCurrent.EXCEPTION, BiPaymentWorkstepCurrent.CALCULATING)).toBe(false);
    expect(isValidTransition(BiPaymentWorkstepCurrent.EXCEPTION, BiPaymentWorkstepCurrent.RECONCILIATION)).toBe(false);
  });
});
