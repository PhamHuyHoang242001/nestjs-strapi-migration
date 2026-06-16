import { SelectQueryBuilder } from 'typeorm';
import { applyDataScope } from '../helpers/data-scope-applier';
import type { DataScope } from '@common/authorization/types/data-scope.types';

// ── Spy QueryBuilder ─────────────────────────────────────────────────────────
// Records the SQL fragments + parameters that applyDataScope emits via
// andWhere() / setParameter(). We only assert on what the helper actually
// calls — no real DB connection or metadata is required.

interface Captured {
  params: Record<string, unknown>;
  whereSqls: string[];
}

function makeSpy(): { qb: SelectQueryBuilder<unknown>; captured: Captured } {
  const captured: Captured = { params: {}, whereSqls: [] };
  const qb = {
    setParameter(name: string, val: unknown) {
      captured.params[name] = val;
      return qb;
    },
    andWhere(sql: string) {
      captured.whereSqls.push(sql);
      return qb;
    },
  } as unknown as SelectQueryBuilder<unknown>;
  return { qb, captured };
}

const ALIAS = 'r';

// ── Tests ────────────────────────────────────────────────────────────────────

describe('applyDataScope()', () => {
  it('scope === null → no-op (admin path)', () => {
    const { qb, captured } = makeSpy();
    applyDataScope(qb, ALIAS, 'bi_hub_diagnostic_reports', null);
    expect(captured.whereSqls).toHaveLength(0);
    expect(Object.keys(captured.params)).toHaveLength(0);
  });

  it('both branches empty → emits "1 = 0"', () => {
    const { qb, captured } = makeSpy();
    const scope: DataScope = { explicit: [], ownedRoots: null };
    applyDataScope(qb, ALIAS, 'bi_hub_diagnostic_reports', scope);
    expect(captured.whereSqls).toEqual(['1 = 0']);
    expect(Object.keys(captured.params)).toHaveLength(0);
  });

  it('explicit only → r.id = ANY(:dsExplicit_*)', () => {
    const { qb, captured } = makeSpy();
    const scope: DataScope = { explicit: [1, 2, 3], ownedRoots: null };
    applyDataScope(qb, ALIAS, 'bi_hub_diagnostic_reports', scope);

    expect(captured.whereSqls).toHaveLength(1);
    expect(captured.whereSqls[0]).toMatch(/^\(r\.id = ANY\(:dsExplicit_[a-z0-9]{8}\)\)$/);

    const paramNames = Object.keys(captured.params);
    expect(paramNames).toHaveLength(1);
    expect(paramNames[0]).toMatch(/^dsExplicit_[a-z0-9]{8}$/);
    expect(captured.params[paramNames[0]]).toEqual([1, 2, 3]);
  });

  it('owned root === tableName (bicc_department) → r.id = ANY(:dsOwned_*)', () => {
    const { qb, captured } = makeSpy();
    const scope: DataScope = {
      explicit: [],
      ownedRoots: { rootTable: 'bi_hub_bicc_departments', rootIds: [10, 20] },
    };
    applyDataScope(qb, ALIAS, 'bi_hub_bicc_departments', scope);

    expect(captured.whereSqls).toHaveLength(1);
    expect(captured.whereSqls[0]).toMatch(/^\(r\.id = ANY\(:dsOwned_[a-z0-9]{8}\)\)$/);
    expect(captured.whereSqls[0]).not.toContain('EXISTS');

    const paramNames = Object.keys(captured.params);
    expect(paramNames).toHaveLength(1);
    expect(paramNames[0]).toMatch(/^dsOwned_[a-z0-9]{8}$/);
    expect(captured.params[paramNames[0]]).toEqual([10, 20]);
  });

  it('owned 1-hop (bi_hub_diagnostic_reports → bicc_departments) → EXISTS with single FROM, no JOIN', () => {
    const { qb, captured } = makeSpy();
    const scope: DataScope = {
      explicit: [],
      ownedRoots: { rootTable: 'bi_hub_bicc_departments', rootIds: [10] },
    };
    applyDataScope(qb, ALIAS, 'bi_hub_diagnostic_reports', scope);

    expect(captured.whereSqls).toHaveLength(1);
    const sql = captured.whereSqls[0];
    expect(sql).toContain('EXISTS (');
    expect(sql).toContain('"bi_hub_bicc_departments"');
    expect(sql).not.toContain('INNER JOIN');
    expect(sql).toMatch(/r\."bicc_department_id"/);
    expect(sql).toContain('deleted_at IS NULL');
    expect(sql).toMatch(/:dsOwned_[a-z0-9]{8}/);

    const paramNames = Object.keys(captured.params);
    expect(paramNames).toHaveLength(1);
    expect(captured.params[paramNames[0]]).toEqual([10]);
  });

  it('owned 2-hop (ma_tool_documents → workspaces) → EXISTS with FROM + INNER JOIN', () => {
    const { qb, captured } = makeSpy();
    const scope: DataScope = {
      explicit: [],
      ownedRoots: { rootTable: 'ma_tool_workspaces', rootIds: [5] },
    };
    applyDataScope(qb, ALIAS, 'ma_tool_documents', scope);

    expect(captured.whereSqls).toHaveLength(1);
    const sql = captured.whereSqls[0];
    expect(sql).toContain('EXISTS (');
    expect(sql).toContain('"ma_tool_templates"');
    expect(sql).toContain('"ma_tool_workspaces"');
    expect(sql).toContain('INNER JOIN');
    expect(sql).toMatch(/r\."template_id"/);
    expect(sql).toMatch(/"workspace_id"/);
    expect(sql).toMatch(/:dsOwned_[a-z0-9]{8}/);
  });

  it('both branches present → "(explicit OR owned)"', () => {
    const { qb, captured } = makeSpy();
    const scope: DataScope = {
      explicit: [99],
      ownedRoots: { rootTable: 'bi_hub_bicc_departments', rootIds: [10] },
    };
    applyDataScope(qb, ALIAS, 'bi_hub_diagnostic_reports', scope);

    expect(captured.whereSqls).toHaveLength(1);
    const sql = captured.whereSqls[0];
    expect(sql).toContain(' OR ');
    expect(sql).toMatch(/r\.id = ANY\(:dsExplicit_/);
    expect(sql).toContain('EXISTS (');

    const paramNames = Object.keys(captured.params).sort();
    expect(paramNames).toHaveLength(2);
    expect(paramNames.find((n) => n.startsWith('dsExplicit_'))).toBeDefined();
    expect(paramNames.find((n) => n.startsWith('dsOwned_'))).toBeDefined();
  });

  it('emits no deny clause (owner branch is immune; deny handled upstream in getAccessibleRecords)', () => {
    const { qb, captured } = makeSpy();
    const scope: DataScope = {
      explicit: [1, 2, 3],
      ownedRoots: { rootTable: 'bi_hub_bicc_departments', rootIds: [10] },
    };
    applyDataScope(qb, ALIAS, 'bi_hub_diagnostic_reports', scope);

    expect(captured.whereSqls).toHaveLength(1);
    expect(captured.whereSqls[0]).not.toMatch(/<> ALL\(:dsDeny/);
    const denyParam = Object.keys(captured.params).find((n) => n.startsWith('dsDeny_'));
    expect(denyParam).toBeUndefined();
  });

  it('tableName unknown to HIERARCHY_MAP + ownedRoots set → owner branch dropped, falls back to explicit', () => {
    const { qb, captured } = makeSpy();
    const scope: DataScope = {
      explicit: [7],
      ownedRoots: { rootTable: 'bi_hub_bicc_departments', rootIds: [10] },
    };
    applyDataScope(qb, ALIAS, 'totally_unknown_table', scope);

    expect(captured.whereSqls).toHaveLength(1);
    expect(captured.whereSqls[0]).toMatch(/^\(r\.id = ANY\(:dsExplicit_[a-z0-9]{8}\)\)$/);
    expect(captured.whereSqls[0]).not.toContain('EXISTS');
    expect(captured.whereSqls[0]).not.toContain(' OR ');
  });

  it('tableName unknown + only ownedRoots (no explicit) → "1 = 0"', () => {
    const { qb, captured } = makeSpy();
    const scope: DataScope = {
      explicit: [],
      ownedRoots: { rootTable: 'bi_hub_bicc_departments', rootIds: [10] },
    };
    applyDataScope(qb, ALIAS, 'totally_unknown_table', scope);

    expect(captured.whereSqls).toEqual(['1 = 0']);
  });

  it('param suffix unique across two consecutive calls', () => {
    const { qb: qb1, captured: c1 } = makeSpy();
    const { qb: qb2, captured: c2 } = makeSpy();
    const scope: DataScope = { explicit: [1], ownedRoots: null };

    applyDataScope(qb1, ALIAS, 'bi_hub_diagnostic_reports', scope);
    applyDataScope(qb2, ALIAS, 'bi_hub_diagnostic_reports', scope);

    const suffix1 = Object.keys(c1.params)[0].split('_')[1];
    const suffix2 = Object.keys(c2.params)[0].split('_')[1];
    expect(suffix1).not.toEqual(suffix2);
    expect(suffix1).toMatch(/^[a-z0-9]{8}$/);
    expect(suffix2).toMatch(/^[a-z0-9]{8}$/);
  });

  it('does not mutate the scope argument', () => {
    const { qb } = makeSpy();
    const scope: DataScope = {
      explicit: [1, 2],
      ownedRoots: { rootTable: 'bi_hub_bicc_departments', rootIds: [10] },
    };
    const frozen = JSON.parse(JSON.stringify(scope)) as DataScope;
    applyDataScope(qb, ALIAS, 'bi_hub_diagnostic_reports', scope);
    expect(scope).toEqual(frozen);
  });
});
