import {
  MA_REPORT_WHOLE_BANK_CODE,
  MA_REPORT_HEAD_OFFICE_CODE,
  MA_REPORT_TEMPLATE_FOLDER,
} from '@configuration/env.config';
import { MaToolSbvRptCvtOutput } from '@modules/databases/ma-tool-sbv-rpt-cvt-output.entity';
import { MaToolBranchConfig } from '@modules/databases/ma-tool-branch-config.entity';
import { MaToolMappingUserBranch } from '@modules/databases/ma-tool-mapping-user-branch.entity';
import { MaToolCstbRptExportMapping } from '@modules/databases/ma-tool-cstb-rpt-export-mapping.entity';

import { buildDueDate, formatDateKey } from './report-date.helper';
import { buildSearchNilFileName } from './report-filename.helper';

export interface NilReportGeneratorInput {
  existingReports: MaToolSbvRptCvtOutput[];
  rptProps: Array<{ rpt_code: string; frq_code: string; branch_rpt_ind: string }>;
  mappingMap: Map<string, MaToolCstbRptExportMapping>;
  frq_code: string | undefined;
  dateMode: string;
  baseDate: Date;
  year: number;
  monthIndex: number;
  targetBranches: MaToolMappingUserBranch[];
  wholeBankVnCode: MaToolBranchConfig | undefined;
  headOfficeCode: MaToolBranchConfig | undefined;
}

/**
 * Generate nil (no-data) report entries for missing report/branch/date combinations.
 * Ported 1:1 from strapiv5-old searchReport nil-report logic (lines 199-361).
 */
export function generateNilReports(input: NilReportGeneratorInput): any[] {
  const {
    existingReports,
    rptProps,
    mappingMap,
    frq_code,
    dateMode,
    baseDate,
    year,
    monthIndex,
    targetBranches,
    wholeBankVnCode,
    headOfficeCode,
  } = input;

  // Build existing key set
  const existingKeySet = new Set(
    existingReports.map((o) => {
      const d = new Date(o.report_date);
      const ds = formatDateKey(d);
      const sbvCode = o.branch_sbv_code === MA_REPORT_WHOLE_BANK_CODE ? MA_REPORT_HEAD_OFFICE_CODE : o.branch_sbv_code;
      return `${o.rpt_code}_${o.frq_code.toUpperCase()}_${sbvCode}_${ds}`;
    }),
  );

  const today = new Date();
  const nilReports: any[] = [];

  for (const p of rptProps) {
    const sbvMapping = mappingMap.get(p.rpt_code);
    if (!sbvMapping) continue;

    const frq = p.frq_code.toUpperCase();
    const isBranchReport = p.branch_rpt_ind !== 'Y';

    // Build due dates based on frequency
    const dueDates: Date[] = [];
    if (dateMode === 'MONTH' && frq_code && frq === 'D') {
      const lastDayOfMonth = new Date(year, monthIndex + 1, 0).getDate();
      for (let d = 1; d <= lastDayOfMonth; d++) {
        dueDates.push(new Date(year, monthIndex, d));
      }
    } else {
      const due = buildDueDate(baseDate, frq, dateMode);
      if (due) {
        if (frq === 'D') {
          for (let d = new Date(baseDate); d <= due; d.setDate(d.getDate() + 1)) {
            dueDates.push(new Date(d));
          }
        } else if (frq === 'M3') {
          if (dateMode === 'DAY') {
            dueDates.push(due);
          } else {
            buildM3DueDates(due, dueDates);
          }
        } else {
          dueDates.push(due);
        }
      }
    }

    // Determine branches for this report
    let branchesForReport: string[];
    if (isBranchReport) {
      branchesForReport = [wholeBankVnCode?.branch_sbv_code ?? ''];
    } else {
      branchesForReport = targetBranches.map((b) => b.branch?.branch_sbv_code);
      if (
        branchesForReport.includes(wholeBankVnCode?.branch_sbv_code) &&
        !branchesForReport.includes(headOfficeCode?.branch_sbv_code)
      ) {
        branchesForReport.push(headOfficeCode?.branch_sbv_code ?? '');
      }
    }

    // Generate nil report entries for each due date x branch
    for (const dueDate of dueDates) {
      if (dueDate > today) continue;
      const dueStr = formatDateKey(dueDate);
      const formatDate = formatDateByFrequency(dueDate, frq);

      for (const bId of branchesForReport) {
        let branch = bId;
        if (bId === wholeBankVnCode?.branch_sbv_code) {
          branch = MA_REPORT_HEAD_OFFICE_CODE;
        }

        const key = `${p.rpt_code}_${frq}_${branch}_${dueStr}`;
        if (existingKeySet.has(key)) continue;

        const fileName = buildSearchNilFileName(sbvMapping.rpt_code_sbv, bId, formatDate, isBranchReport);

        nilReports.push({
          id: `NIL|${p.rpt_code}|${bId}|${formatDate}`,
          rpt_code: p.rpt_code,
          frq_code: frq,
          branch_code: branch,
          branch_rpt_type: isBranchReport,
          report_date: dueDate,
          is_old_version: false,
          cvt_status: false,
          template_file_path: `${MA_REPORT_TEMPLATE_FOLDER}${fileName}`,
          file_name: fileName,
          report_created_at: new Date(),
        });
      }
    }
  }

  return nilReports;
}

/**
 * Build M3 (3-times-per-month) due dates for MONTH mode.
 * Ported 1:1 from Strapi's complex M3 logic.
 */
function buildM3DueDates(due: Date, dueDates: Date[]): void {
  const day1 = new Date(due.getFullYear(), due.getMonth(), 1);
  const day30 = new Date(due.getFullYear(), due.getMonth(), due.getDate() - 1);
  const monthsWith30Days = [3, 5, 8, 10];

  if (due.getDate() === 31) {
    dueDates.push(due);
    for (
      let d = new Date(day1);
      d < day30;
      d.getDate() === 1 ? d.setDate(d.getDate() + 9) : d.setDate(d.getDate() + 10)
    ) {
      if (d.getDate() !== 1) dueDates.push(new Date(d));
    }
  } else if (
    (due.getDate() === 28 && due.getMonth() === 1) ||
    (due.getDate() === 29 && due.getMonth() === 1) ||
    (due.getDate() === 30 && monthsWith30Days.includes(due.getMonth()))
  ) {
    dueDates.push(due);
    for (
      let d = new Date(day1);
      d < due;
      d.getDate() === 1 ? d.setDate(d.getDate() + 9) : d.setDate(d.getDate() + 10)
    ) {
      if (d.getDate() !== 1) dueDates.push(new Date(d));
    }
  } else {
    for (
      let d = new Date(day1);
      d <= due;
      d.getDate() === 1 ? d.setDate(d.getDate() + 9) : d.setDate(d.getDate() + 10)
    ) {
      if (d.getDate() !== 1 && d.getDate() !== 30) dueDates.push(new Date(d));
    }
  }
}

/** Format date string based on frequency for nil report filenames */
function formatDateByFrequency(dueDate: Date, frq: string): string {
  const y = dueDate.getFullYear().toString();
  const m = String(dueDate.getMonth() + 1).padStart(2, '0');
  const d = String(dueDate.getDate()).padStart(2, '0');

  switch (frq) {
    case 'D':
    case 'M3':
      return `${y}${m}${d}`;
    case 'M':
    case 'Y2':
    case 'Q':
      return `${y}${m}`;
    case 'Y':
      return y;
    default:
      return `${y}${m}${d}`;
  }
}
