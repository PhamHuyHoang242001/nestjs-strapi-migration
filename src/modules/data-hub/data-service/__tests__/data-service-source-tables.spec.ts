import { makeSqlMock, SqlHandler } from '../../dictionary/__tests__/dictionary-test-helpers';
import { syncSourceTables } from '../data-service-source-tables.util';

const OWN = /WHERE p.data_service_id = \$1 AND .*FOR UPDATE/s;
const TABLES = /AS usable\s+FROM data_hub_source_tables st WHERE st.id = ANY/;
const PREVIOUS = /SELECT DISTINCT p.source_table_id AS id FROM data_hub_physical_terms p/;
const LOCK_TABLES = /SELECT st.id FROM data_hub_source_tables st WHERE st.id = ANY\(\$1\).*ORDER BY st.id FOR UPDATE/s;
const DELETE_EMPTY = /UPDATE data_hub_source_tables st SET deleted_at = NOW\(\)/;
const NAME_CHECK = /WHERE .*LOWER\(st.name\) = \$1/s;
const CODES_TAKEN = /JOIN UNNEST\(\$1::int\[\], \$2::text\[\]\)/;
const TERM_UPDATE = /UPDATE data_hub_physical_terms p\s+SET code = u.code/;
// New-term ids come from the sequence (one row per term), then one INSERT ... UNNEST.
const RESERVE = /nextval\(pg_get_serial_sequence\('data_hub_physical_terms'/;
const reserve = (...ids: number[]): [RegExp, () => unknown[]] => [RESERVE, () => ids.map((id) => ({ id }))];
const PARK = /SET code = '~moving~' \|\| id/;
const MAPPED = /SELECT DISTINCT p.logical_term_id/;

const own = (over: Record<string, unknown> = {}) => ({
  id: 7,
  code: 'cust_id',
  technical_description: 'd',
  data_type: 'VARCHAR',
  is_required: false,
  example_value: null,
  source_table_id: 5,
  logical_term_id: null,
  ...over,
});

const run = (handlers: SqlHandler[], groups: unknown[], extra: Record<string, unknown> = {}) => {
  const mock = makeSqlMock(handlers);
  const promise = syncSourceTables(mock.manager as never, {
    dataServiceId: 10,
    departmentId: 1,
    scopeDepartmentIds: [1, 2],
    userId: 3,
    groups: groups as never,
    ...extra,
  });
  return { ...mock, promise };
};

describe('syncSourceTables', () => {
  it('creates a new table in the service department and a new term in it', async () => {
    const { promise, calls } = run(
      [[/INSERT INTO data_hub_source_tables/, () => [{ id: 20 }]], reserve(30)],
      [
        {
          name: 'dw.new',
          description: 'x',
          terms: [{ code: 'a', technical_description: 'td', data_type: 'VARCHAR', example_value: '' }],
        },
      ],
    );
    await expect(promise).resolves.toEqual({ termIds: [30], affectedLogicalIds: [] });
    const table = calls.find((c) => /INSERT INTO data_hub_source_tables/.test(c.sql));
    expect(table?.params).toEqual(['dw.new', 'x', 1, 3]);
    const term = calls.find((c) => /INSERT INTO data_hub_physical_terms/.test(c.sql));
    expect(term?.params).toEqual([[30], ['a'], ['td'], ['VARCHAR'], [false], [null], [20], [null], 10, 3]);
    expect(calls.find((c) => NAME_CHECK.test(c.sql))?.params).toEqual(['dw.new', null]);
  });

  it('keeps an unchanged term without writing it, soft-deletes the terms left out', async () => {
    const { promise, calls } = run(
      [
        [TABLES, () => [{ id: 5, name: 'dw.t', description: null, usable: true }]],
        [OWN, () => [own(), own({ id: 8, code: 'old', logical_term_id: 4 })]],
      ],
      [{ id: 5, name: 'dw.t', terms: [{ id: 7, code: 'cust_id', technical_description: 'd', data_type: 'VARCHAR' }] }],
    );
    await expect(promise).resolves.toEqual({ termIds: [7], affectedLogicalIds: [4] });
    const del = calls.find((c) => /SET deleted_at = NOW\(\), is_deleted = true/.test(c.sql));
    expect(del?.params).toEqual([[8], 3]);
    expect(calls.some((c) => TERM_UPDATE.test(c.sql) || PARK.test(c.sql))).toBe(false);
    expect(calls.some((c) => /UPDATE data_hub_source_tables/.test(c.sql))).toBe(false);
  });

  it('rewrites a term whose only change is Data Type / Required, without touching its logical term', async () => {
    const { promise, calls } = run(
      [
        [TABLES, () => [{ id: 5, name: 'dw.t', description: null, usable: true }]],
        [OWN, () => [own({ logical_term_id: 2 })]],
      ],
      [
        {
          id: 5,
          name: 'dw.t',
          terms: [{ id: 7, code: 'cust_id', technical_description: 'd', data_type: 'NUMBER', is_required: true }],
        },
      ],
    );
    await expect(promise).resolves.toEqual({ termIds: [7], affectedLogicalIds: [] });
    const upd = calls.find((c) => TERM_UPDATE.test(c.sql));
    expect(upd?.params).toEqual([[7], ['cust_id'], ['d'], ['NUMBER'], [true], [null], [5], [2], 3]);
  });

  it('updates an edited term and flags its logical term when the code changes', async () => {
    const { promise, calls } = run(
      [
        [TABLES, () => [{ id: 5, name: 'dw.t', description: null, usable: true }]],
        [OWN, () => [own({ logical_term_id: 2 })]],
      ],
      [
        {
          id: 5,
          name: 'dw.t',
          terms: [{ id: 7, code: 'cust_no', technical_description: 'd2', data_type: 'VARCHAR', example_value: 'e' }],
        },
      ],
    );
    await expect(promise).resolves.toEqual({ termIds: [7], affectedLogicalIds: [2] });
    const upd = calls.find((c) => TERM_UPDATE.test(c.sql));
    expect(upd?.params).toEqual([[7], ['cust_no'], ['d2'], ['VARCHAR'], [false], ['e'], [5], [2], 3]);
  });

  it('swaps codes between two own terms: both are parked first, then written, then new terms inserted', async () => {
    const { promise, calls } = run(
      [
        [TABLES, () => [{ id: 5, name: 'dw.t', description: null, usable: true }]],
        [OWN, () => [own({ id: 7, code: 'x' }), own({ id: 8, code: 'y' })]],
        reserve(9),
      ],
      [
        {
          id: 5,
          name: 'dw.t',
          terms: [
            { code: 'z', technical_description: 'd', data_type: 'VARCHAR' },
            { id: 7, code: 'y', technical_description: 'd', data_type: 'VARCHAR' },
            { id: 8, code: 'x', technical_description: 'd', data_type: 'VARCHAR' },
          ],
        },
      ],
    );
    await expect(promise).resolves.toEqual({ termIds: [9, 7, 8], affectedLogicalIds: [] });
    const kind = (sql: string) => {
      if (PARK.test(sql)) return 'park';
      if (TERM_UPDATE.test(sql)) return 'update';
      return /INSERT INTO data_hub_physical_terms/.test(sql) ? 'insert' : null;
    };
    const order = calls.map((c) => kind(c.sql)).filter(Boolean);
    expect(order).toEqual(['park', 'update', 'insert']);
    expect(calls.find((c) => PARK.test(c.sql))?.params).toEqual([[7, 8]]);
  });

  it('locks mapped logical terms before the physicals; a table rename versions the logicals of all its terms', async () => {
    const { promise, calls } = run(
      [
        [TABLES, () => [{ id: 5, name: 'dw.t', description: null, usable: true }]],
        [
          MAPPED,
          () => [
            { logical_term_id: 3, in_renamed: true },
            { logical_term_id: 4, in_renamed: false },
          ],
        ],
        [/FROM data_hub_logical_terms lt/, () => [{ id: 3 }, { id: 4 }]],
        [OWN, () => [own()]],
      ],
      [{ id: 5, name: 'dw.t2', terms: [{ id: 7, code: 'cust_id', technical_description: 'd', data_type: 'VARCHAR' }] }],
    );
    await expect(promise).resolves.toEqual({ termIds: [7], affectedLogicalIds: [3] });
    expect(calls.find((c) => MAPPED.test(c.sql))?.params).toEqual([10, [5]]);
    const lockAt = calls.findIndex((c) => /FROM data_hub_logical_terms lt/.test(c.sql));
    expect(lockAt).toBeGreaterThan(-1);
    expect(lockAt).toBeLessThan(calls.findIndex((c) => OWN.test(c.sql)));
  });

  it('maps terms to logical terms: re-mapping versions both logicals, unknown logical ids are rejected', async () => {
    const LOCK = /FROM data_hub_logical_terms lt/;
    const { promise, calls } = run(
      [
        [TABLES, () => [{ id: 5, name: 'dw.t', description: null, usable: true }]],
        [MAPPED, () => [{ logical_term_id: 2, in_renamed: false }]],
        [LOCK, () => [{ id: 2 }, { id: 4 }]],
        [OWN, () => [own({ logical_term_id: 2 })]],
        reserve(9),
      ],
      [
        {
          id: 5,
          name: 'dw.t',
          terms: [
            { id: 7, code: 'cust_id', technical_description: 'd', data_type: 'VARCHAR', logical_term_id: 4 },
            { code: 'new_col', technical_description: 'n', data_type: 'VARCHAR', logical_term_id: 4 },
          ],
        },
      ],
    );
    await expect(promise).resolves.toEqual({ termIds: [7, 9], affectedLogicalIds: [2, 4] });
    expect(calls.find((c) => LOCK.test(c.sql))?.params).toEqual([[2, 4]]);
    expect(calls.find((c) => TERM_UPDATE.test(c.sql))?.params).toEqual([
      [7],
      ['cust_id'],
      ['d'],
      ['VARCHAR'],
      [false],
      [null],
      [5],
      [4],
      3,
    ]);
    expect(calls.find((c) => /INSERT INTO data_hub_physical_terms/.test(c.sql))?.params).toEqual([
      [9],
      ['new_col'],
      ['n'],
      ['VARCHAR'],
      [false],
      [null],
      [5],
      [4],
      10,
      3,
    ]);

    const bad = run(
      [[TABLES, () => [{ id: 5, name: 'dw.t', description: null, usable: true }]]],
      [
        {
          id: 5,
          name: 'dw.t',
          terms: [{ code: 'x', technical_description: 'd', data_type: 'VARCHAR', logical_term_id: 99 }],
        },
      ],
    );
    await expect(bad.promise).rejects.toThrow('INVALID_LOGICAL_TERMS: 99');
  });

  it('locks the tables involved first and deletes a table the service left empty (its name is freed)', async () => {
    const { promise, calls } = run(
      [
        [PREVIOUS, () => [{ id: 5 }, { id: 6 }]],
        [TABLES, () => [{ id: 5, name: 'dw.t', description: null, usable: true }]],
        [OWN, () => [own(), own({ id: 8, code: 'old', source_table_id: 6 })]],
      ],
      [{ id: 5, name: 'dw.t', terms: [{ id: 7, code: 'cust_id', technical_description: 'd', data_type: 'VARCHAR' }] }],
    );
    await expect(promise).resolves.toEqual({ termIds: [7], affectedLogicalIds: [] });
    const lock = calls.findIndex((c) => LOCK_TABLES.test(c.sql));
    expect(calls[lock].params).toEqual([[5, 6]]);
    expect(lock).toBeLessThan(calls.findIndex((c) => TABLES.test(c.sql)));
    // only table 6 (left by the service) is a candidate; the NOT EXISTS keeps it if another service still uses it
    const del = calls.find((c) => DELETE_EMPTY.test(c.sql));
    expect(del?.params).toEqual([[6], 3]);
    expect(del?.sql).toContain('NOT EXISTS (SELECT 1 FROM data_hub_physical_terms p WHERE p.source_table_id = st.id');
  });

  it('renames an existing table after checking the new name is free', async () => {
    const { promise, calls } = run(
      [
        [TABLES, () => [{ id: 5, name: 'dw.t', description: null, usable: true }]],
        [OWN, () => []],
      ],
      [{ id: 5, name: 'dw.t2', description: 'desc', terms: [] }],
    );
    await promise;
    expect(calls.find((c) => NAME_CHECK.test(c.sql))?.params).toEqual(['dw.t2', 5]);
    expect(calls.find((c) => /UPDATE data_hub_source_tables/.test(c.sql))?.params).toEqual([5, 'dw.t2', 'desc', 3]);
  });

  it("403 for a table outside the caller's departments; 400 for a missing one", async () => {
    const forbidden = run(
      [[TABLES, () => [{ id: 5, name: 'dw.other', description: null, usable: false }]]],
      [{ id: 5, name: 'dw.other', terms: [] }],
    );
    await expect(forbidden.promise).rejects.toThrow('SOURCE_TABLE_FORBIDDEN: dw.other');
    const scopeCall = forbidden.calls.find((c) => TABLES.test(c.sql));
    const scopeSql = scopeCall?.sql ?? '';
    expect(scopeSql).toContain('$2::int[] IS NULL');
    expect(scopeSql).toContain('st.department_id = ANY($2::int[])');
    expect(scopeSql).toContain('sv.department_id = ANY($2::int[])');
    expect(scopeSql).toContain('sp.data_service_id = $3::int');
    // a table used only by inactive services cannot be picked by another service
    expect(scopeSql).toMatch(/EXISTS \(SELECT 1 FROM data_hub_physical_terms ap .*os.status = 'active'/s);
    expect(scopeCall?.params).toEqual([[5], [1, 2], 10]);

    const missing = run([[TABLES, () => []]], [{ id: 5, name: 'x', terms: [] }]);
    await expect(missing.promise).rejects.toThrow('INVALID_SOURCE_TABLES: 5');
  });

  it('409 when a new table name is taken or a code exists in the table for another service', async () => {
    const name = run([[NAME_CHECK, () => [{ id: 1 }]]], [{ name: 'DW.T', terms: [] }]);
    await expect(name.promise).rejects.toThrow('SOURCE_TABLE_NAME_EXISTS: DW.T');

    const code = run(
      [
        [TABLES, () => [{ id: 5, name: 'dw.t', description: null, usable: true }]],
        [CODES_TAKEN, () => [{ code: 'cust_id', table_name: 'dw.t' }]],
      ],
      [{ id: 5, name: 'dw.t', terms: [{ code: 'CUST_ID', technical_description: 'd', data_type: 'VARCHAR' }] }],
    );
    await expect(code.promise).rejects.toThrow('PHYSICAL_CODE_EXISTS: dw.t.cust_id');
    const check = code.calls.find((c) => CODES_TAKEN.test(c.sql));
    expect(check?.params).toEqual([[5], ['cust_id'], 10]);
    expect(code.calls.some((c) => /INSERT INTO data_hub_physical_terms/.test(c.sql))).toBe(false);
  });

  it('400 for a term id the service does not own', async () => {
    const { promise } = run(
      [[TABLES, () => [{ id: 5, name: 'dw.t', description: null, usable: true }]]],
      [{ id: 5, name: 'dw.t', terms: [{ id: 99, code: 'x', technical_description: 'd', data_type: 'VARCHAR' }] }],
    );
    await expect(promise).rejects.toThrow('INVALID_PHYSICAL_TERMS: 99');
  });

  it('payload checks: duplicate tables, duplicate term ids, duplicate codes in one table', async () => {
    const twoTables = [
      { name: 'A', terms: [] },
      { name: 'a', terms: [] },
    ];
    await expect(run([], twoTables).promise).rejects.toThrow('DUPLICATE_SOURCE_TABLES');
    const sameTermTwice = [
      { id: 1, name: 'A', terms: [{ id: 3, code: 'x', technical_description: 'd', data_type: 'VARCHAR' }] },
      { id: 2, name: 'B', terms: [{ id: 3, code: 'y', technical_description: 'd', data_type: 'VARCHAR' }] },
    ];
    await expect(run([], sameTermTwice).promise).rejects.toThrow('DUPLICATE_PHYSICAL_TERMS');
    const sameCode = [
      {
        name: 'A',
        terms: [
          { code: 'x', technical_description: 'd', data_type: 'VARCHAR' },
          { code: 'X', technical_description: 'd', data_type: 'VARCHAR' },
        ],
      },
    ];
    await expect(run([], sameCode).promise).rejects.toThrow('DUPLICATE_TERM_CODES: A: X');
    // the same code in two different tables is fine
    const ok = run(
      [[/INSERT INTO data_hub_source_tables/, () => [{ id: 20 }]], reserve(31, 30)],
      [
        { name: 'A', terms: [{ code: 'x', technical_description: 'd', data_type: 'VARCHAR' }] },
        { name: 'B', terms: [{ code: 'x', technical_description: 'd', data_type: 'VARCHAR' }] },
      ],
    );
    // reserved ids are handed out ascending in body order, as row-by-row inserts would assign them
    await expect(ok.promise).resolves.toMatchObject({ termIds: [30, 31] });
  });
});
