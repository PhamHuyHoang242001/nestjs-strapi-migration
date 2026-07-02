import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { MaToolReportService } from './ma-tool-report.service';
import { MaToolCstbRptProperty } from '@modules/databases/ma-tool-cstb-rpt-property.entity';
import type { DataScope } from '@common/authorization/types/data-scope.types';

// A chainable QB stub that records every andWhere fragment so we can assert the
// emitted predicate. Terminal resolvers (getMany/getCount/getRawOne/getOne) are
// configurable per query builder.
function makeQb(resolves: { many?: any[]; count?: number; rawOne?: any; one?: any }) {
  const andWhereSql: string[] = [];
  const qb: any = {
    andWhereSql,
    select: jest.fn(() => qb),
    where: jest.fn((sql: string) => {
      andWhereSql.push(sql);
      return qb;
    }),
    andWhere: jest.fn((sql: string) => {
      andWhereSql.push(sql);
      return qb;
    }),
    setParameter: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
    skip: jest.fn(() => qb),
    take: jest.fn(() => qb),
    getMany: jest.fn().mockResolvedValue(resolves.many ?? []),
    getCount: jest.fn().mockResolvedValue(resolves.count ?? 0),
    getRawOne: jest.fn().mockResolvedValue(resolves.rawOne),
    getOne: jest.fn().mockResolvedValue(resolves.one),
  };
  return qb;
}

function buildService(qbQueue: any[]) {
  let i = 0;
  const repo = {
    createQueryBuilder: jest.fn(() => qbQueue[i++]),
  } as unknown as Repository<MaToolCstbRptProperty>;
  return { service: new MaToolReportService(repo), repo };
}

const query = {} as any;

describe('MaToolReportService', () => {
  describe('findAll — data scope', () => {
    it('emits explicit ANY predicate for explicit grants', async () => {
      const qb = makeQb({ many: [{ id: 1 }, { id: 2 }], count: 2 });
      const { service } = buildService([qb]);
      const scope: DataScope = { explicit: [1, 2], ownedRoots: null };

      const res = await service.findAll(query, scope);

      expect(res.data).toHaveLength(2);
      const joined = qb.andWhereSql.join(' | ');
      expect(joined).toContain('rpt.id = ANY(');
      // Explicit-only table: never emits the owner EXISTS branch.
      expect(joined).not.toContain('EXISTS (');
    });

    it('emits 1 = 0 (default-deny) for empty explicit + no owned roots', async () => {
      const qb = makeQb({ many: [], count: 0 });
      const { service } = buildService([qb]);
      const scope: DataScope = { explicit: [], ownedRoots: null };

      const res = await service.findAll(query, scope);

      expect(res.data).toHaveLength(0);
      expect(qb.andWhereSql.join(' | ')).toContain('1 = 0');
    });

    it('adds no scope predicate when scope is null (admin/internal path)', async () => {
      const qb = makeQb({ many: [{ id: 9 }], count: 1 });
      const { service } = buildService([qb]);

      await service.findAll(query, null);

      const joined = qb.andWhereSql.join(' | ');
      expect(joined).not.toContain('id = ANY(');
      expect(joined).not.toContain('1 = 0');
    });
  });

  describe('findOne — 404 vs 403', () => {
    it('throws NotFoundException when the record is missing', async () => {
      const fetchQb = makeQb({ one: null });
      const { service } = buildService([fetchQb]);
      await expect(service.findOne(5, { explicit: [5], ownedRoots: null })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ForbiddenException when present but out of scope', async () => {
      const fetchQb = makeQb({ one: { id: 5 } });
      const scopeQb = makeQb({ rawOne: undefined }); // scope probe finds nothing
      const { service } = buildService([fetchQb, scopeQb]);
      await expect(service.findOne(5, { explicit: [999], ownedRoots: null })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('returns the entity when present and in scope', async () => {
      const fetchQb = makeQb({ one: { id: 5, rpt_code: 'RPT-5' } });
      const scopeQb = makeQb({ rawOne: { one: 1 } });
      const { service } = buildService([fetchQb, scopeQb]);
      const res = await service.findOne(5, { explicit: [5], ownedRoots: null });
      expect(res).toEqual({ id: 5, rpt_code: 'RPT-5' });
    });

    it('bypasses the scope probe when scope is null (admin path)', async () => {
      const fetchQb = makeQb({ one: { id: 5 } });
      const { service, repo } = buildService([fetchQb]);
      const res = await service.findOne(5, null);
      expect(res).toEqual({ id: 5 });
      // Only the fetch QB was created — no scope probe.
      expect((repo.createQueryBuilder as jest.Mock).mock.calls).toHaveLength(1);
    });
  });
});
