import {
  MA_REPORT_WHOLE_BANK_CODE,
  MA_REPORT_HEAD_OFFICE_CODE,
} from '@configuration/env.config';

/**
 * Build template filename for nil (no-data) reports.
 * Ported from strapiv5-old/src/common/util.ts:buildSearchNilFileName
 */
export function buildSearchNilFileName(
  sbv: string,
  branch: string,
  reportDate: string,
  hasBranches: boolean,
): string {
  let rtpType = 'XI';
  if (hasBranches) {
    rtpType = 'XT';
  }
  let branchCode = branch;
  if (branch === MA_REPORT_WHOLE_BANK_CODE) {
    branchCode = MA_REPORT_HEAD_OFFICE_CODE;
    rtpType = 'XT';
  }
  return `${sbv}-${branchCode}-${MA_REPORT_HEAD_OFFICE_CODE}-${reportDate}-${rtpType}-N.xlsx`;
}
