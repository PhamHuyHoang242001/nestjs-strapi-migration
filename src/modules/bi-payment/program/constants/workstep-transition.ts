import { BiPaymentWorkstepCurrent } from '@common/enums/bi-payment.enums';

// Transition map cho bp_program_next_step. Service chỉ cho phép step kế hợp lệ.
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
