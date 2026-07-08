import { MaToolWorkstepType } from '@common/enums/ma-tool.enums';
import { WORKSTEP_TYPE_PERM } from '../bi-payment-document.service';

// Mapping template.workstep_type → permission code. Drives which endpoint each file lives under.
// Sale chỉ có bp_program_reconciliation_sale → chỉ gọi recon_data endpoint (upload+view).
describe('bi-payment document workstep_type → permission map', () => {
  it('prepare → bp_program_preparing', () => {
    expect(WORKSTEP_TYPE_PERM[MaToolWorkstepType.PREPARE]).toBe('bp_program_preparing');
  });

  it('ex_prepare → bp_program_preparing (exception loop)', () => {
    expect(WORKSTEP_TYPE_PERM[MaToolWorkstepType.EX_PREPARE]).toBe('bp_program_preparing');
  });

  it('recon_data → bp_program_reconciliation_sale (sale upload+view)', () => {
    expect(WORKSTEP_TYPE_PERM[MaToolWorkstepType.RECON_DATA]).toBe('bp_program_reconciliation_sale');
  });

  it('recon_feedback → bp_program_reconciliation_bicc (bicc full)', () => {
    expect(WORKSTEP_TYPE_PERM[MaToolWorkstepType.RECON_FEEDBACK]).toBe('bp_program_reconciliation_bicc');
  });

  it('sale (_sale) does NOT match bicc-only endpoint codes', () => {
    const saleVerb = WORKSTEP_TYPE_PERM[MaToolWorkstepType.RECON_DATA];
    const biccEndpointCode = 'bp_program_reconciliation_bicc';
    // OR verb-gate: sale có saleVerb, endpoint gắn biccEndpointCode → sale không pass.
    expect(saleVerb).not.toBe(biccEndpointCode);
  });

  it('sale cannot approve/next_step — those codes are distinct from _sale', () => {
    const saleVerb = WORKSTEP_TYPE_PERM[MaToolWorkstepType.RECON_DATA];
    expect(saleVerb).not.toBe('bp_program_next_step');
    expect(saleVerb).not.toBe('bp_program_confirm_release');
    expect(saleVerb).not.toBe('bp_program_calculating');
  });
});
