import { findRootTable, buildOwnerJoinChain, buildAccessibleCTE } from '../helpers/owner-scope-helpers';

// ── findRootTable() ─────────────────────────────────────────────────────────

describe('findRootTable()', () => {
  it('returns same table when table is root (null hierarchy)', () => {
    expect(findRootTable('bi_hub_bicc_departments')).toBe('bi_hub_bicc_departments');
    expect(findRootTable('ma_tool_workspaces')).toBe('ma_tool_workspaces');
  });

  it('walks up 1 level: bi_hub_reports → bicc_departments', () => {
    expect(findRootTable('bi_hub_reports')).toBe('bi_hub_bicc_departments');
  });

  it('walks up 1 level: bi_hub_diagnostic_reports → bicc_departments', () => {
    expect(findRootTable('bi_hub_diagnostic_reports')).toBe('bi_hub_bicc_departments');
  });

  it('walks up 1 level: ma_tool_templates → workspaces', () => {
    expect(findRootTable('ma_tool_templates')).toBe('ma_tool_workspaces');
  });

  it('walks up 2 levels: ma_tool_documents → workspaces', () => {
    expect(findRootTable('ma_tool_documents')).toBe('ma_tool_workspaces');
  });

  it('returns null for unknown table', () => {
    expect(findRootTable('nonexistent_table')).toBeNull();
  });

  it('walks up bi_payment chain correctly', () => {
    expect(findRootTable('bi_payment_programs')).toBe('bi_payment_projects');
    expect(findRootTable('bi_payment_work_steps')).toBe('bi_payment_projects');
  });
});

// ── buildOwnerJoinChain() ───────────────────────────────────────────────────

describe('buildOwnerJoinChain()', () => {
  it('root table: direct join to resource_owners with resource_type', () => {
    const result = buildOwnerJoinChain('bi_hub_bicc_departments', '$1');
    expect(result).not.toBeNull();
    expect(result!.joinSQL).toContain('resource_owners');
    expect(result!.joinSQL).toContain("resource_type = 'bicc_department'");
    expect(result!.joinSQL).toContain('$1');
    expect(result!.rootTable).toBe('bi_hub_bicc_departments');
  });

  it('1-level child: join through parent to resource_owners', () => {
    const result = buildOwnerJoinChain('bi_hub_reports', '$1');
    expect(result).not.toBeNull();
    expect(result!.joinSQL).toContain('bi_hub_bicc_departments');
    expect(result!.joinSQL).toContain('resource_owners');
    expect(result!.joinSQL).toContain("resource_type = 'bicc_department'");
  });

  it('2-level child: join through 2 parents to resource_owners', () => {
    const result = buildOwnerJoinChain('ma_tool_documents', '$1');
    expect(result).not.toBeNull();
    expect(result!.joinSQL).toContain('ma_tool_templates');
    expect(result!.joinSQL).toContain('ma_tool_workspaces');
    expect(result!.joinSQL).toContain('resource_owners');
    expect(result!.joinSQL).toContain("resource_type = 'workspace'");
  });

  it('returns null for table without ROOT_OWNER_CONFIG (bi_payment)', () => {
    const result = buildOwnerJoinChain('bi_payment_projects', '$1');
    expect(result).toBeNull();
  });

  it('returns null for unknown table', () => {
    const result = buildOwnerJoinChain('nonexistent', '$1');
    expect(result).toBeNull();
  });

  it('join chain references correct FK columns', () => {
    const result = buildOwnerJoinChain('ma_tool_documents', '$1');
    expect(result).not.toBeNull();
    // documents → templates via template_id
    expect(result!.joinSQL).toContain('template_id');
    // templates → workspaces via workspace_id
    expect(result!.joinSQL).toContain('workspace_id');
  });
});

// ── buildAccessibleCTE() ────────────────────────────────────────────────────

describe('buildAccessibleCTE()', () => {
  it('generates UNION ALL branches', () => {
    const result = buildAccessibleCTE('$1');
    expect(result.cteSql).toContain('UNION ALL');
  });

  it('includes all bi_hub scoped tables', () => {
    const result = buildAccessibleCTE('$1');
    expect(result.cteSql).toContain('bi_hub_bicc_departments');
    expect(result.cteSql).toContain('bi_hub_reports');
    expect(result.cteSql).toContain('bi_hub_diagnostic_reports');
  });

  it('includes all ma_tool scoped tables', () => {
    const result = buildAccessibleCTE('$1');
    expect(result.cteSql).toContain('ma_tool_workspaces');
    expect(result.cteSql).toContain('ma_tool_templates');
    expect(result.cteSql).toContain('ma_tool_documents');
  });

  it('all branches join to resource_owners with correct resource_type', () => {
    const result = buildAccessibleCTE('$1');
    expect(result.cteSql).toContain('resource_owners');
    expect(result.cteSql).toContain("resource_type = 'bicc_department'");
    expect(result.cteSql).toContain("resource_type = 'workspace'");
  });

  it('skips tables without ROOT_OWNER_CONFIG root (bi_payment)', () => {
    const result = buildAccessibleCTE('$1');
    expect(result.cteSql).not.toContain('bi_payment_projects');
    expect(result.cteSql).not.toContain('bi_payment_programs');
    expect(result.cteSql).not.toContain('bi_payment_work_steps');
    expect(result.cteSql).not.toContain('bi_payment_checklists');
    expect(result.cteSql).not.toContain('bi_payment_other_files');
  });

  it('each branch selects data_id and table_name', () => {
    const result = buildAccessibleCTE('$1');
    expect(result.cteSql).toContain('as data_id');
    expect(result.cteSql).toContain('as table_name');
  });

  it('includes role_id filter with provided param', () => {
    const result = buildAccessibleCTE('$2');
    expect(result.cteSql).toContain('$2');
  });
});
