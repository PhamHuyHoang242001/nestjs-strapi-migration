/** Table names registered in `modules` seeder — used with @RequireDataAccess(tableName) */
export enum DATA_ACCESS_TABLE {
  // Data Uploader
  MA_TOOL_WORKSPACES = 'ma_tool_workspaces',
  MA_TOOL_TEMPLATES = 'ma_tool_templates',
  MA_TOOL_DOCUMENTS = 'ma_tool_documents',

  // BI Hub
  BI_HUB_BICC_DEPARTMENTS = 'bi_hub_bicc_departments',
  BI_HUB_REPORTS = 'bi_hub_reports',
  BI_HUB_DIAGNOSTIC_REPORTS = 'bi_hub_diagnostic_reports',

  // BI Payment
  BI_PAYMENT_PROJECTS = 'bi_payment_projects',
  BI_PAYMENT_PROGRAMS = 'bi_payment_programs',
  BI_PAYMENT_WORK_STEPS = 'bi_payment_work_steps',
  BI_PAYMENT_CHECKLISTS = 'bi_payment_checklists',
  BI_PAYMENT_OTHER_FILES = 'bi_payment_other_files',
}
