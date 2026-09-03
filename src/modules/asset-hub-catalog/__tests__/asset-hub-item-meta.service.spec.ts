import { BadRequestException } from '@nestjs/common';
import {
  AssetHubItemMetaService,
  MAX_RESPONSIBLE_USERS,
  MAX_VERSION_TAGS,
  packageOwningFields,
} from '../asset-hub-item-meta.service';

interface CapturedWhere {
  clause: string;
  params?: Record<string, unknown>;
}

// Mock EntityManager: `getRepository().createQueryBuilder()` for the catalog lookups, `query` for
// the users lookup, and delete/create/save for the full-replace writes.
function makeManager(options: { count?: number; userRows?: Array<{ id: number }> } = {}) {
  const wheres: CapturedWhere[] = [];
  const deletes: Array<{ entity?: string; criteria: unknown }> = [];
  const savedBatches: unknown[][] = [];

  const qb: Record<string, jest.Mock> = {
    where: jest.fn((clause: string, params?: Record<string, unknown>) => {
      wheres.push({ clause, params });
      return qb;
    }),
    andWhere: jest.fn((clause: string, params?: Record<string, unknown>) => {
      wheres.push({ clause, params });
      return qb;
    }),
    getCount: jest.fn(() => Promise.resolve(options.count ?? 0)),
  };

  const manager = {
    getRepository: jest.fn(() => ({ createQueryBuilder: () => qb })),
    query: jest.fn(() => Promise.resolve(options.userRows ?? [])),
    delete: jest.fn((entity: { name?: string }, criteria: unknown) => {
      deletes.push({ entity: entity?.name, criteria });
      return Promise.resolve();
    }),
    create: jest.fn((_entity: unknown, data: unknown) => data),
    save: jest.fn((rows: unknown[]) => {
      savedBatches.push(rows);
      return Promise.resolve(rows);
    }),
  };

  return { manager, wheres, deletes, savedBatches };
}

describe('AssetHubItemMetaService.assertPublisher', () => {
  it('accepts a live publisher', async () => {
    const { manager } = makeManager({ count: 1 });

    await expect(new AssetHubItemMetaService().assertPublisher(manager as never, 3)).resolves.toBeUndefined();
  });

  it('rejects an unknown publisher as bad input, not a missing resource', async () => {
    const { manager } = makeManager({ count: 0 });

    await expect(new AssetHubItemMetaService().assertPublisher(manager as never, 999)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('excludes soft-deleted publishers', async () => {
    const { manager, wheres } = makeManager({ count: 1 });

    await new AssetHubItemMetaService().assertPublisher(manager as never, 3);

    const clauses = wheres.map((w) => w.clause);
    expect(clauses).toContain('p.deleted_at IS NULL');
    expect(clauses).toContain('COALESCE(p.is_deleted, false) = false');
  });
});

describe('AssetHubItemMetaService.assertUsers', () => {
  it('returns the deduped ids when every user resolves', async () => {
    const { manager } = makeManager({ userRows: [{ id: 11 }, { id: 12 }] });

    await expect(new AssetHubItemMetaService().assertUsers(manager as never, [11, 12, 11])).resolves.toEqual([11, 12]);
  });

  it('rejects an empty list', async () => {
    const { manager } = makeManager();

    await expect(new AssetHubItemMetaService().assertUsers(manager as never, [])).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects more than the cap', async () => {
    const { manager } = makeManager();
    const tooMany = Array.from({ length: MAX_RESPONSIBLE_USERS + 1 }, (_, i) => i + 1);

    await expect(new AssetHubItemMetaService().assertUsers(manager as never, tooMany)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects when any id does not resolve to a live user', async () => {
    const { manager } = makeManager({ userRows: [{ id: 11 }] });

    await expect(new AssetHubItemMetaService().assertUsers(manager as never, [11, 12])).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('binds the ids as a parameter and filters soft-deleted users', async () => {
    const { manager } = makeManager({ userRows: [{ id: 11 }] });

    await new AssetHubItemMetaService().assertUsers(manager as never, [11]);

    const [sql, params] = manager.query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('id = ANY($1)');
    expect(sql).toContain('deleted_at IS NULL');
    expect(sql).toContain('COALESCE(is_deleted, false) = false');
    expect(params).toEqual([[11]]);
  });
});

describe('AssetHubItemMetaService.assertTags', () => {
  it('treats no tags as valid — tags are optional', async () => {
    const { manager } = makeManager();

    await expect(new AssetHubItemMetaService().assertTags(manager as never, [], 'skill')).resolves.toEqual([]);
    expect(manager.getRepository).not.toHaveBeenCalled();
  });

  it('scopes the lookup to the workspace artifact type', async () => {
    const { manager, wheres } = makeManager({ count: 1 });

    await new AssetHubItemMetaService().assertTags(manager as never, [21], 'prompt');

    expect(wheres).toContainEqual({ clause: 't.artifact_type = :artifact_type', params: { artifact_type: 'prompt' } });
  });

  it('rejects a tag belonging to the other workspace', async () => {
    // The scoped query simply does not find it, so the count falls short.
    const { manager } = makeManager({ count: 0 });

    await expect(new AssetHubItemMetaService().assertTags(manager as never, [21], 'skill')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects more than the cap', async () => {
    const { manager } = makeManager({ count: MAX_VERSION_TAGS + 1 });
    const tooMany = Array.from({ length: MAX_VERSION_TAGS + 1 }, (_, i) => i + 1);

    await expect(new AssetHubItemMetaService().assertTags(manager as never, tooMany, 'skill')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('allows a mix of enterprise and personal tags', async () => {
    const { manager, wheres } = makeManager({ count: 2 });

    await expect(new AssetHubItemMetaService().assertTags(manager as never, [21, 22], 'skill')).resolves.toEqual([
      21, 22,
    ]);
    expect(wheres.some((w) => w.clause.includes('kind'))).toBe(false);
  });
});

describe('AssetHubItemMetaService full-replace writes', () => {
  it('clears prior people in charge before inserting the new set', async () => {
    const { manager, deletes, savedBatches } = makeManager();

    await new AssetHubItemMetaService().replaceResponsibles(manager as never, 'skill', 5, [11, 12]);

    expect(deletes).toEqual([{ entity: 'SkillPackageResponsible', criteria: { skill_package_id: 5 } }]);
    expect(savedBatches[0]).toEqual([
      { skill_package_id: 5, user_id: 11 },
      { skill_package_id: 5, user_id: 12 },
    ]);
  });

  it('uses the prompt column and entity for the prompt workspace', async () => {
    const { manager, deletes, savedBatches } = makeManager();

    await new AssetHubItemMetaService().replaceResponsibles(manager as never, 'prompt', 5, [11]);

    expect(deletes).toEqual([{ entity: 'PromptPackageResponsible', criteria: { prompt_package_id: 5 } }]);
    expect(savedBatches[0]).toEqual([{ prompt_package_id: 5, user_id: 11 }]);
  });

  it('clears prior version tags and inserts the new set', async () => {
    const { manager, deletes, savedBatches } = makeManager();

    await new AssetHubItemMetaService().replaceVersionTags(manager as never, 'skill', 9, [21, 22]);

    expect(deletes).toEqual([{ entity: 'SkillVersionTag', criteria: { skill_version_id: 9 } }]);
    expect(savedBatches[0]).toEqual([
      { skill_version_id: 9, tag_id: 21 },
      { skill_version_id: 9, tag_id: 22 },
    ]);
  });

  it('still clears the old rows when the new tag list is empty', async () => {
    const { manager, deletes, savedBatches } = makeManager();

    await new AssetHubItemMetaService().replaceVersionTags(manager as never, 'prompt', 9, []);

    expect(deletes).toEqual([{ entity: 'PromptVersionTag', criteria: { prompt_version_id: 9 } }]);
    expect(savedBatches).toHaveLength(0);
  });

  it('drops duplicate ids rather than inserting a duplicate link', async () => {
    const { manager, savedBatches } = makeManager();

    await new AssetHubItemMetaService().replaceVersionTags(manager as never, 'skill', 9, [21, 21, 22]);

    expect(savedBatches[0]).toHaveLength(2);
  });
});

describe('packageOwningFields', () => {
  it('create omit → publisher_id + owning_unit_name null', () => {
    expect(packageOwningFields(3, undefined, 'create')).toEqual({ publisher_id: 3, owning_unit_name: null });
  });

  it('bump omit → publisher_id only', () => {
    expect(packageOwningFields(3, undefined, 'bump')).toEqual({ publisher_id: 3 });
  });

  it('empty string clears to null', () => {
    expect(packageOwningFields(3, '  ', 'bump')).toEqual({ publisher_id: 3, owning_unit_name: null });
  });

  it('trims freetext', () => {
    expect(packageOwningFields(3, '  P&C  ', 'create')).toEqual({
      publisher_id: 3,
      owning_unit_name: 'P&C',
    });
  });
});
