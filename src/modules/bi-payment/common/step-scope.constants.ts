import { MaToolWorkstepType } from '@common/enums/ma-tool.enums';

// Map template.workstep_type → permission code. Single source of truth — drives
// which step a document/template belongs to and which code gates it. Frozen so
// no consumer can mutate the shared map at runtime.
export const WORKSTEP_TYPE_PERM: Readonly<Record<MaToolWorkstepType, string>> = Object.freeze({
  [MaToolWorkstepType.PREPARE]: 'bp_program_preparing',
  [MaToolWorkstepType.RECON_DATA]: 'bp_program_reconciliation_sale',
  [MaToolWorkstepType.RECON_FEEDBACK]: 'bp_program_reconciliation_bicc',
  [MaToolWorkstepType.EX_PREPARE]: 'bp_program_preparing',
});

// Full set of template workstep_type values. SO owners are granted all of these
// (own-all); non-SO users only the subset whose code they hold at the program.
export const ALL_WORKSTEP_TYPES: readonly MaToolWorkstepType[] = Object.freeze(Object.values(MaToolWorkstepType));

// One-way VIEW-only bonuses: a code that lets the holder ALSO view a workstep
// not their own primary code. Bicc owns the full reconciliation picture, so it
// can additionally read sale's recon_data. Sale does NOT inherit bicc's
// recon_feedback (asymmetric). Only affects view/list flows; create/own still
// use WORKSTEP_TYPE_PERM so recon_data stays sale-owned for writes.
export const WORKSTEP_BONUS_VIEW_BY_CODE: Readonly<Record<string, readonly MaToolWorkstepType[]>> = Object.freeze({
  bp_program_reconciliation_bicc: [MaToolWorkstepType.RECON_DATA],
});

// All codes that grant VIEW access to a workstep: its primary code (gate for
// create/own) ∪ any code that carries a view-bonus for it. View flows use this
// instead of WORKSTEP_TYPE_PERM so a bonus code widens visible worksteps.
export function viewCodesForWorkstep(ws: MaToolWorkstepType): readonly string[] {
  const codes = [WORKSTEP_TYPE_PERM[ws]];
  for (const [code, steps] of Object.entries(WORKSTEP_BONUS_VIEW_BY_CODE)) {
    if (steps.includes(ws)) codes.push(code);
  }
  return codes;
}
