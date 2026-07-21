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

  // bi_payment: project → program → { work_step, checklist → other_file, document, template }
  bi_payment_programs: { parentTable: 'bi_payment_projects', fkColumn: 'project_id' },
  bi_payment_work_steps: { parentTable: 'bi_payment_programs', fkColumn: 'program_id' },
  bi_payment_checklists: { parentTable: 'bi_payment_programs', fkColumn: 'program_id' },
  bi_payment_other_files: { parentTable: 'bi_payment_checklists', fkColumn: 'bi_payment_checklist_id' },
  bi_payment_documents: { parentTable: 'bi_payment_programs', fkColumn: 'program_id' },
  bi_payment_templates: { parentTable: 'bi_payment_programs', fkColumn: 'bi_payment_program_id' },
  bi_payment_comments: { parentTable: 'bi_payment_programs', fkColumn: 'program_id' },
  // audit tables — scope theo parent program/project (read-only history/log-change).
  bi_payment_program_histories: { parentTable: 'bi_payment_programs', fkColumn: 'program_id' },
  bi_payment_program_log_changes: { parentTable: 'bi_payment_programs', fkColumn: 'program_id' },
  bi_payment_project_histories: { parentTable: 'bi_payment_projects', fkColumn: 'project_id' },
  // category = config dùng chung (whole-table, root null → ko record-scope owner).
  bi_payment_categories: null,
  // project treo dưới bicc-department (owner-scope root) → BICC owner kế thừa verb subtree.
  bi_payment_projects: { parentTable: 'bi_hub_bicc_departments', fkColumn: 'bicc_department_id' },

  // bi_hub: bicc_department → { reports, diagnostic_report }
  bi_hub_bicc_departments: null,
  bi_hub_reports: { parentTable: 'bi_hub_bicc_departments', fkColumn: 'bicc_department_id' },
  bi_hub_diagnostic_reports: { parentTable: 'bi_hub_bicc_departments', fkColumn: 'bicc_department_id' },

  // ma_tool report: standalone root (no parent FK). Owner scope here is
  // whole-table ("own-all") via a sentinel resource_owners row — see
  // OWNER_ALL_TABLES and ROOT_OWNER_CONFIG below.
  ma_tool_cstb_rpt_properties: null,
};

/** Whitelist of tables allowed for data access rules and records browser */
export const ALLOWED_TABLES = new Set(Object.keys(HIERARCHY_MAP));

/**
 * Subset of ALLOWED_TABLES that may be the TARGET of a data_access rule (i.e. a rule
 * can be created against these tables). Business rule: in bi_payment, scoping stops at
 * the program level — leaf tables (checklists, other_files, documents, templates,
 * comments, work_steps, histories, log_changes, categories) inherit scope from their
 * program/project ancestor and never carry their own rule. Restricting the rule-target
 * set keeps the accessible-records CTE from emitting JOIN branches (and thus FK column
 * references like bi_payment_checklist_id / bi_payment_document_id) for tables that will
 * never hold a rule — which also avoids schema-drift errors on DBs using a different FK
 * naming convention.
 *
 * Distinct from ALLOWED_TABLES: every table with a hierarchy entry is still browsable
 * via the records browser (getScopedRecords walks HIERARCHY_MAP); only rule creation
 * is gated by this set.
 */
export const RULE_TARGET_TABLES = new Set<string>([
  // bi_hub roots + level-1 reports
  'bi_hub_bicc_departments',
  'bi_hub_reports',
  'bi_hub_diagnostic_reports',
  // bi_payment: scope stops at program (no leaf rules)
  'bi_payment_projects',
  'bi_payment_programs',
  // ma_tool roots
  'ma_tool_workspaces',
  'ma_tool_cstb_rpt_properties',
]);

/**
 * Whole-table SO ("own-all") roots. Ownership here is not per-record: a role is
 * declared SO of the ENTIRE table via a single sentinel resource_owners row
 * (resource_id = OWNER_ALL_RESOURCE_ID). Members of such a role browse every row
 * of the table through the records browser; non-owners see none.
 *
 * Distinct from the standard per-record owner scope (bicc/workspace) where a role
 * owns specific root IDs. The sentinel does NOT match any real row in the id-join
 * or EXISTS predicate, so the read API (applyDataScope) stays record-scoped —
 * own-all visibility is resolved explicitly in getScopedRecords only.
 */
export const OWNER_ALL_TABLES = new Set<string>(['ma_tool_cstb_rpt_properties']);

/**
 * Sentinel resource_id marking a whole-table ("own-all") SO assignment.
 * Relies on real rows never having id = 0 (Postgres serial/identity starts at 1),
 * so the sentinel never collides with a genuine record in id-join/EXISTS predicates.
 */
export const OWNER_ALL_RESOURCE_ID = 0;

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
  bi_payment_documents: 'document_name',
  bi_payment_templates: 'name',
  bi_payment_comments: 'value',
  bi_payment_categories: 'name',
  bi_payment_program_histories: 'name',
  bi_payment_program_log_changes: 'workstep',
  bi_payment_project_histories: 'id',
  ma_tool_cstb_rpt_properties: 'rpt_code',
};

/** Maps root table → resource_type discriminator for polymorphic owner scoping */
export interface RootOwnerEntry {
  resourceType: string;
}

export const ROOT_OWNER_CONFIG: Record<string, RootOwnerEntry> = {
  bi_hub_bicc_departments: { resourceType: 'bicc_department' },
  ma_tool_workspaces: { resourceType: 'workspace' },
  // Whole-table SO: role owns ALL reports via a sentinel resource_owners row.
  // Registered here so owner_assignments accepts the type and SO members receive
  // ma_tool_report_view as an implied verb (module-path derivation). See OWNER_ALL_TABLES.
  ma_tool_cstb_rpt_properties: { resourceType: 'ma_tool_report' },
};

/**
 * Reverse lookup: resource_type discriminator → root table name.
 * Used by OwnerScopeResolverService to map resource_owners rows back to a root table for hierarchy walk.
 * Invariant enforced at module load: keys === values(ROOT_OWNER_CONFIG).resourceType.
 */
export const RESOURCE_TYPE_TO_ROOT_TABLE: Record<string, string> = Object.entries(ROOT_OWNER_CONFIG).reduce(
  (acc, [rootTable, entry]) => {
    acc[entry.resourceType] = rootTable;
    return acc;
  },
  {} as Record<string, string>,
);

// Invariant guard: detect drift between forward + reverse maps at module load
{
  const forwardTypes = new Set(Object.values(ROOT_OWNER_CONFIG).map((e) => e.resourceType));
  const reverseTypes = new Set(Object.keys(RESOURCE_TYPE_TO_ROOT_TABLE));
  if (forwardTypes.size !== reverseTypes.size) {
    throw new Error('hierarchy-config: RESOURCE_TYPE_TO_ROOT_TABLE drift from ROOT_OWNER_CONFIG');
  }
  for (const t of forwardTypes) {
    if (!reverseTypes.has(t)) {
      throw new Error(`hierarchy-config: resource_type "${t}" missing from RESOURCE_TYPE_TO_ROOT_TABLE`);
    }
  }
}

/** Safe column name lookup with regex validation */
export function getNameColumn(tableName: string): string {
  const col = NAME_COLUMN_MAP[tableName] || 'id';
  if (!/^[a-z_]+$/.test(col)) return 'id';
  return col;
}

/**
 * Extra fields to select per table for the data-access list, on top of the
 * display-name column. Dev-maintained whitelist — empty array or a missing
 * table means "no extra fields". Field names are sanitized at read time by
 * getExtraFields() so they are safe to interpolate into the SELECT statement.
 *
 * Example:
 *   EXTRA_FIELDS_MAP = { bi_hub_reports: ['code', 'status'] }
 * → each /list group for bi_hub_reports carries record_extra: {code, status}.
 */
export const EXTRA_FIELDS_MAP: Record<string, string[]> = {
  // bi_hub_reports: ['code', 'status'],
  // bi_payment_documents: ['doc_type', 'amount'],
};

/**
 * Sanitized extra-field list for a table. Filters out any field failing the
 * same /^[a-z_]+$/ regex as getNameColumn so a bad config entry can never reach
 * the SELECT statement. Returns [] for tables not in the map.
 */
export function getExtraFields(tableName: string): string[] {
  return (EXTRA_FIELDS_MAP[tableName] || []).filter((c) => /^[a-z_]+$/.test(c));
}
