import { MaToolWorkstepType } from '@common/enums/ma-tool.enums';
import { WORKSTEP_VIEW_CODES } from '../../common/step-scope.constants';

// View-code map only. Legacy workstep→single-code export was removed.
describe('bi-payment document workstep_type → view-code map', () => {
  it('prepare → upload + approve', () => {
    expect(WORKSTEP_VIEW_CODES[MaToolWorkstepType.PREPARE]).toEqual(['bp_program_upload', 'bp_program_approve']);
  });

  it('ex_prepare → upload + approve', () => {
    expect(WORKSTEP_VIEW_CODES[MaToolWorkstepType.EX_PREPARE]).toEqual(['bp_program_upload', 'bp_program_approve']);
  });

  it('recon_data → upload + upload_recon', () => {
    expect(WORKSTEP_VIEW_CODES[MaToolWorkstepType.RECON_DATA]).toEqual(['bp_program_upload', 'bp_program_upload_recon']);
  });

  it('recon_feedback → upload only', () => {
    expect(WORKSTEP_VIEW_CODES[MaToolWorkstepType.RECON_FEEDBACK]).toEqual(['bp_program_upload']);
  });

  it('approve is not exposed to recon_feedback', () => {
    expect(WORKSTEP_VIEW_CODES[MaToolWorkstepType.RECON_FEEDBACK]).not.toContain('bp_program_approve');
  });
});
