/**
 * Static configuration for data access table hierarchy and display columns.
 * Single source of truth — used by DataAccessService and HierarchyValidationService.
 */

export interface HierarchyEntry {
  parentTable: string;
  fkColumn: string;
}

/** Parent-child relationships for hierarchy validation */
export const HIERARCHY_MAP: Record<string, HierarchyEntry | null> = {
  // ma_tool: workspace → template → document
  ma_tool_documents: { parentTable: 'ma_tool_templates', fkColumn: 'template_id' },
  ma_tool_templates: { parentTable: 'ma_tool_workspaces', fkColumn: 'workspace_id' },
  ma_tool_workspaces: null,

  // bi_payment: project → program → { work_step, checklist → other_file }
  bi_payment_programs: { parentTable: 'bi_payment_projects', fkColumn: 'project_id' },
  bi_payment_work_steps: { parentTable: 'bi_payment_programs', fkColumn: 'program_id' },
  bi_payment_checklists: { parentTable: 'bi_payment_programs', fkColumn: 'program_id' },
  bi_payment_other_files: { parentTable: 'bi_payment_checklists', fkColumn: 'bi_payment_checklist_id' },
  bi_payment_projects: null,

  // bi_hub: bicc_department → { reports, diagnostic_report }
  bi_hub_bicc_departments: null,
  bi_hub_reports: { parentTable: 'bi_hub_bicc_departments', fkColumn: 'bicc_department_id' },
  bi_hub_diagnostic_reports: { parentTable: 'bi_hub_bicc_departments', fkColumn: 'bicc_department_id' },
};

/** Whitelist of tables allowed for data access rules and records browser */
export const ALLOWED_TABLES = new Set(Object.keys(HIERARCHY_MAP));

/** Maps table name → primary display column for UI. Falls back to 'id'. */
export const NAME_COLUMN_MAP: Record<string, string> = {
  bi_hub_bicc_departments: 'name',
  bi_hub_reports: 'name',
  ma_tool_templates: 'name',
  ma_tool_documents: 'document_name',
  bi_payment_projects: 'project_name',
  bi_payment_programs: 'name',
  bi_payment_work_steps: 'step_name',
  ma_tool_workspaces: 'name',
  bi_hub_diagnostic_reports: 'name',
  bi_payment_checklists: 'name',
  bi_payment_other_files: 'name',
};

/** Maps root table → resource_type discriminator for polymorphic owner scoping */
export interface RootOwnerEntry {
  resourceType: string;
}

export const ROOT_OWNER_CONFIG: Record<string, RootOwnerEntry> = {
  bi_hub_bicc_departments: { resourceType: 'bicc_department' },
  ma_tool_workspaces: { resourceType: 'workspace' },
};

/** Safe column name lookup with regex validation */
export function getNameColumn(tableName: string): string {
  const col = NAME_COLUMN_MAP[tableName] || 'id';
  if (!/^[a-z_]+$/.test(col)) return 'id';
  return col;
}
