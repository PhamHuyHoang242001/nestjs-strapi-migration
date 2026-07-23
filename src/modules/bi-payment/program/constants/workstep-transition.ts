import { BiPaymentWorkstepCurrent } from '@common/enums/bi-payment.enums';

// Program transition map. Service only allows the configured next workstep.
// exception → preparing: vòng mới (xử lý ngoại lệ xong quay lại chuẩn bị).
export const WORKSTEP_TRANSITIONS: Record<BiPaymentWorkstepCurrent, BiPaymentWorkstepCurrent[]> = {
  [BiPaymentWorkstepCurrent.CREATE_A_PROGRAM]: [BiPaymentWorkstepCurrent.PREPARING],
  [BiPaymentWorkstepCurrent.PREPARING]: [BiPaymentWorkstepCurrent.CALCULATING],
  [BiPaymentWorkstepCurrent.CALCULATING]: [BiPaymentWorkstepCurrent.RECONCILIATION],
  [BiPaymentWorkstepCurrent.RECONCILIATION]: [BiPaymentWorkstepCurrent.WAITING_FOR_APPROVAL],
  [BiPaymentWorkstepCurrent.EXCEPTION]: [BiPaymentWorkstepCurrent.PREPARING],
  [BiPaymentWorkstepCurrent.WAITING_FOR_APPROVAL]: [BiPaymentWorkstepCurrent.RELEASE],
  [BiPaymentWorkstepCurrent.RELEASE]: [], // terminal
};

export function isValidTransition(from: BiPaymentWorkstepCurrent, to: BiPaymentWorkstepCurrent): boolean {
  const allowed = WORKSTEP_TRANSITIONS[from] ?? [];
  return allowed.includes(to);
}
