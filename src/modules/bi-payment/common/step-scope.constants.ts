import { MaToolWorkstepType } from '@common/enums/ma-tool.enums';

// Full set of template workstep_type values. SO owners are granted all of these
// (own-all); non-SO users only the subset whose code they hold at the program.
export const ALL_WORKSTEP_TYPES: readonly MaToolWorkstepType[] = Object.freeze(Object.values(MaToolWorkstepType));

// Permission codes that grant document/template visibility for each workstep.
// Template lifecycle permissions remain independent from this content map.
//
// - PREPARE / EX_PREPARE ("prepare" docs): upload (full) uploads them; approve
//   sees them read-only to approve/reject.
// - RECON_DATA ("tra soát" / sale step): upload (full) sees all; upload_recon
//   sees only its own (own-filter applied by the resolver, see OWN_ONLY_CODES).
// - RECON_FEEDBACK ("feedback" / bicc step): only upload (full).
// confirm grants no document view — it only gates the final pic-confirm action.
export const WORKSTEP_VIEW_CODES: Readonly<Record<MaToolWorkstepType, readonly string[]>> = Object.freeze({
  [MaToolWorkstepType.PREPARE]: ['bp_program_upload', 'bp_program_approve'],
  [MaToolWorkstepType.EX_PREPARE]: ['bp_program_upload', 'bp_program_approve'],
  [MaToolWorkstepType.RECON_DATA]: ['bp_program_upload', 'bp_program_upload_recon'],
  [MaToolWorkstepType.RECON_FEEDBACK]: ['bp_program_upload'],
});

// Codes whose access to a workstep is restricted to documents the holder created
// (uploaded_by_id = self). A workstep is own-only for a user when the ONLY view
// code they hold for it is in this set. The resolver widens to full-view the
// moment the user also holds a non-own code (e.g. upload) for that workstep.
export const OWN_ONLY_CODES: ReadonlySet<string> = Object.freeze(new Set(['bp_program_upload_recon']));
