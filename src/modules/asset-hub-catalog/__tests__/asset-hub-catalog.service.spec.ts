import { AssetHubTagArtifactType, AssetHubTagKind } from '@modules/databases/asset-hub-tag.entity';
import { AssetHubCatalogService } from '../asset-hub-catalog.service';

interface CapturedWhere {
  clause: string;
  params?: Record<string, unknown>;
}

// Records the clauses a query builder receives so the specs can assert soft-delete filtering and
// parameter binding without a live database.
function makeQb(rows: unknown[]): { qb: Record<string, jest.Mock>; wheres: CapturedWhere[] } {
  const wheres: CapturedWhere[] = [];
  const qb: Record<string, jest.Mock> = {
    select: jest.fn(() => qb),
    where: jest.fn((clause: string, params?: Record<string, unknown>) => {
      wheres.push({ clause, params });
      return qb;
    }),
    andWhere: jest.fn((clause: string, params?: Record<string, unknown>) => {
      wheres.push({ clause, params });
      return qb;
    }),
    orderBy: jest.fn(() => qb),
    addOrderBy: jest.fn(() => qb),
    getMany: jest.fn(() => Promise.resolve(rows)),
  };
  return { qb, wheres };
}

const tagRow = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 1,
  name: 'Báo cáo',
  kind: AssetHubTagKind.ENTERPRISE,
  artifact_type: AssetHubTagArtifactType.SKILL,
  ...over,
});

describe('AssetHubCatalogService', () => {
  describe('listTags', () => {
    it('projects only the catalog fields', async () => {
      const { qb } = makeQb([tagRow({ id: 7, name: 'Kiểm thử' })]);
      const service = new AssetHubCatalogService({ createQueryBuilder: () => qb } as never, {} as never);

      const result = await service.listTags({});

      expect(result).toEqual({
        data: [
          { id: 7, name: 'Kiểm thử', kind: AssetHubTagKind.ENTERPRISE, artifact_type: AssetHubTagArtifactType.SKILL },
        ],
      });
    });

    it('excludes soft-deleted rows on both markers', async () => {
      const { qb, wheres } = makeQb([]);
      const service = new AssetHubCatalogService({ createQueryBuilder: () => qb } as never, {} as never);

      await service.listTags({});

      const clauses = wheres.map((w) => w.clause);
      expect(clauses).toContain('t.deleted_at IS NULL');
      expect(clauses).toContain('COALESCE(t.is_deleted, false) = false');
    });

    it('binds artifact_type and kind as parameters', async () => {
      const { qb, wheres } = makeQb([]);
      const service = new AssetHubCatalogService({ createQueryBuilder: () => qb } as never, {} as never);

      await service.listTags({ artifact_type: AssetHubTagArtifactType.SKILL, kind: AssetHubTagKind.ENTERPRISE });

      expect(wheres).toContainEqual({
        clause: 't.artifact_type = :artifact_type',
        params: { artifact_type: 'skill' },
      });
      expect(wheres).toContainEqual({ clause: 't.kind = :kind', params: { kind: 'enterprise' } });
    });

    it('applies no type/kind predicate when unfiltered', async () => {
      const { qb, wheres } = makeQb([]);
      const service = new AssetHubCatalogService({ createQueryBuilder: () => qb } as never, {} as never);

      await service.listTags({});

      expect(wheres.some((w) => w.clause.includes('artifact_type ='))).toBe(false);
      expect(wheres.some((w) => w.clause.includes('kind ='))).toBe(false);
    });
  });

  describe('listPublishers', () => {
    it('returns id + name only, excluding soft-deleted rows', async () => {
      const { qb, wheres } = makeQb([{ id: 1, name: 'Khác', is_deleted: false }]);
      const service = new AssetHubCatalogService({} as never, { createQueryBuilder: () => qb } as never);

      const result = await service.listPublishers();

      expect(result).toEqual({ data: [{ id: 1, name: 'Khác' }] });
      const clauses = wheres.map((w) => w.clause);
      expect(clauses).toContain('p.deleted_at IS NULL');
      expect(clauses).toContain('COALESCE(p.is_deleted, false) = false');
    });
  });
});
