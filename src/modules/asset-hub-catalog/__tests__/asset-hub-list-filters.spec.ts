import { applyAssetHubCatalogFilters, escapeIlike } from '../asset-hub-list-filters';

function makeQb() {
  const capturedWheres: string[] = [];
  const capturedParams: Record<string, unknown> = {};
  const qb: any = {
    andWhere: jest.fn((sql: string, p?: Record<string, unknown>) => {
      capturedWheres.push(sql);
      if (p) Object.assign(capturedParams, p);
      return qb;
    }),
    capturedWheres,
    capturedParams,
  };
  return qb;
}

describe('asset-hub-list-filters', () => {
  describe('escapeIlike', () => {
    it('escapes %, _ and backslash so they are literals, not wildcards', () => {
      expect(escapeIlike('100%_off\\x')).toBe('100\\%\\_off\\\\x');
    });
  });

  describe('applyAssetHubCatalogFilters', () => {
    it('search ORs name, description and a non-correlated tag-name subquery', () => {
      const qb = makeQb();
      applyAssetHubCatalogFilters(qb, 'skill', { search: 'happ' });

      const sql = qb.capturedWheres[0];
      expect(sql).toContain('av.name ILIKE :search');
      expect(sql).toContain('av.short_description ILIKE :search');
      expect(sql).toContain('SELECT vt.skill_version_id FROM skill_version_tags vt');
      expect(sql).toContain('t.name ILIKE :search');
      expect(sql).toContain("ESCAPE '\\'");
      expect(sql).not.toContain('EXISTS');
      expect(qb.capturedParams.search).toBe('%happ%');
    });

    it('escapes ILIKE wildcards in the bound search param', () => {
      const qb = makeQb();
      applyAssetHubCatalogFilters(qb, 'prompt', { search: 'a%b_c' });
      expect(qb.capturedParams.search).toBe('%a\\%b\\_c%');
      expect(qb.capturedWheres[0]).toContain('SELECT vt.prompt_version_id FROM prompt_version_tags vt');
    });

    it('a near-match keyword still hits tag name via substring ILIKE', () => {
      const qb = makeQb();
      applyAssetHubCatalogFilters(qb, 'skill', { search: 'Báo' });
      expect(qb.capturedWheres[0]).toContain('t.name ILIKE :search');
      expect(qb.capturedParams.search).toBe('%Báo%');
    });

    it('ignores leftover tag_ids / kind keys — list matching is search-only', () => {
      const qb = makeQb();
      applyAssetHubCatalogFilters(qb, 'skill', {
        tag_ids: [3, 4],
        kind: 'enterprise',
      } as never);

      const joined = qb.capturedWheres.join(' | ');
      expect(joined).not.toContain('tag_ids');
      expect(joined).not.toContain('t.kind');
      expect(qb.capturedParams.tag_ids).toBeUndefined();
      expect(qb.capturedParams.kind).toBeUndefined();
    });

    it('publisher + category bind independently', () => {
      const qb = makeQb();
      applyAssetHubCatalogFilters(qb, 'prompt', {
        publisher_id: 9,
        category_id: 2,
      });

      const joined = qb.capturedWheres.join(' | ');
      expect(joined).toContain('pkg.publisher_id = :publisher_id');
      expect(joined).toContain('av.category_id = :category_id');
      expect(qb.capturedParams).toMatchObject({ publisher_id: 9, category_id: 2 });
    });
  });
});
