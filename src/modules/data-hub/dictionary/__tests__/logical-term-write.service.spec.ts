import { BadRequestException, ConflictException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { LogicalTermHistoryService } from '../logical-term-history.service';
import { LogicalTermWriteService } from '../logical-term-write.service';
import { makeSqlMock, SqlHandler } from './dictionary-test-helpers';

const dto = {
  code: 'CUST_NAME',
  short_description: 'desc',
  example_value: 'x',
  physical_term_ids: [1, 2],
};

const snapshotRow = {
  code: 'CUST_NAME',
  short_description: 'desc',
  example_value: 'x',
  physical_terms: [
    { id: 1, code: 'cust_nm', source_table: 'dw.t' },
    { id: 2, code: 'name', source_table: 'dw.t' },
  ],
};

// Physicals as the lock query returns them: label = source table.code.
const lockPhysicals = (
  rows: Array<{ id: number; physical_column: string; logical_term_id: number | null }>,
): SqlHandler => [
  /WHERE p.id = ANY\(\$1\)/,
  () => rows.map((r) => ({ id: r.id, label: `dw.t.${r.physical_column}`, logical_term_id: r.logical_term_id })),
];

const make = (handlers: SqlHandler[]) => {
  const mock = makeSqlMock(handlers);
  const history = new LogicalTermHistoryService(mock.dataSource as never, {} as never);
  return { ...mock, service: new LogicalTermWriteService(mock.dataSource as never, history) };
};

describe('LogicalTermWriteService.create', () => {
  const free = [
    { id: 1, physical_column: 'cust_nm', logical_term_id: null },
    { id: 2, physical_column: 'name', logical_term_id: null },
  ];

  it('maps physicals and writes a CREATE history with the full snapshot (version 1)', async () => {
    const { service, calls } = make([
      lockPhysicals(free),
      [/INSERT INTO data_hub_logical_terms/, () => [{ id: 7 }]],
      [/json_agg/, () => [snapshotRow]],
    ]);
    const res = await service.create(dto, 99);
    expect(res).toEqual({ id: 7, code: 'CUST_NAME', version_no: 1 });
    const map = calls.find((c) => /UPDATE data_hub_physical_terms SET logical_term_id/.test(c.sql));
    expect(map?.params).toEqual([[1, 2], 7, 99]);
    const hist = calls.find((c) => /INSERT INTO data_hub_logical_term_histories/.test(c.sql));
    expect(hist?.params.slice(0, 3)).toEqual([7, 1, 'CREATE']);
    expect(JSON.parse(hist?.params[3] as string)).toEqual(snapshotRow);
    expect(hist?.params[4]).toBe(99);
  });

  it('rejects a physical already mapped to another term and writes nothing', async () => {
    const { service, calls } = make([lockPhysicals([free[0], { id: 2, physical_column: 'name', logical_term_id: 3 }])]);
    await expect(service.create(dto, 1)).rejects.toThrow('PHYSICAL_ALREADY_MAPPED: dw.t.name');
    expect(calls.some((c) => /INSERT/.test(c.sql))).toBe(false);
  });

  it('rejects unknown physical ids', async () => {
    const { service } = make([lockPhysicals([free[0]])]);
    await expect(service.create(dto, 1)).rejects.toThrow('INVALID_PHYSICAL_TERMS: 2');
  });

  it('maps unique violation on code to 409', async () => {
    const pgErr = new QueryFailedError(
      'q',
      [],
      Object.assign(new Error('dup'), { code: '23505', constraint: 'uq_data_hub_logical_terms_code_live' }),
    );
    const { service } = make([
      lockPhysicals(free),
      [
        /INSERT INTO data_hub_logical_terms/,
        () => {
          throw pgErr;
        },
      ],
    ]);
    await expect(service.create(dto, 1)).rejects.toThrow(ConflictException);
    await expect(service.create(dto, 1)).rejects.toThrow('LOGICAL_TERM_CODE_EXISTS');
  });

  it('inserts only code, description and example (logical terms have no name)', async () => {
    const { service, calls } = make([
      lockPhysicals(free),
      [/INSERT INTO data_hub_logical_terms/, () => [{ id: 7 }]],
      [/json_agg/, () => [snapshotRow]],
    ]);
    await service.create(dto, 1);
    const insert = calls.find((c) => /INSERT INTO data_hub_logical_terms/.test(c.sql));
    expect(insert?.sql).toContain('(code, short_description, example_value, created_by)');
    expect(insert?.params).toEqual(['CUST_NAME', 'desc', 'x', 1]);
  });
});

describe('LogicalTermWriteService.update', () => {
  const current = { code: 'CUST_NAME', short_description: 'desc', example_value: 'x' };
  const attached = [{ id: 1 }, { id: 2 }];

  it('NO_CHANGES when nothing differs', async () => {
    const { service, calls } = make([
      [/FROM data_hub_logical_terms lt WHERE lt.id = \$1/, () => [current]],
      lockPhysicals([
        { id: 1, physical_column: 'cust_nm', logical_term_id: 7 },
        { id: 2, physical_column: 'name', logical_term_id: 7 },
      ]),
      [/WHERE p.logical_term_id = \$1/, () => attached],
    ]);
    await expect(service.update(7, dto, 1)).rejects.toThrow(BadRequestException);
    expect(calls.some((c) => /^\s*UPDATE/.test(c.sql))).toBe(false);
  });

  it('detaches removed + attaches added physicals, bumps version and writes UPDATE snapshot', async () => {
    const { service, calls } = make([
      [/FROM data_hub_logical_terms lt WHERE lt.id = \$1/, () => [current]],
      lockPhysicals([
        { id: 2, physical_column: 'name', logical_term_id: 7 },
        { id: 3, physical_column: 'new_col', logical_term_id: null },
      ]),
      [/WHERE p.logical_term_id = \$1/, () => attached],
      [/RETURNING version_no/, () => [{ version_no: 4 }]],
      [/json_agg/, () => [snapshotRow]],
    ]);
    const res = await service.update(7, { ...dto, physical_term_ids: [2, 3] }, 5);
    expect(res.version_no).toBe(4);
    const maps = calls.filter((c) => /SET logical_term_id = \$2/.test(c.sql)).map((c) => c.params);
    expect(maps).toEqual([
      [[1], null, 5],
      [[3], 7, 5],
    ]);
    const hist = calls.find((c) => /INSERT INTO data_hub_logical_term_histories/.test(c.sql));
    expect(hist?.params.slice(0, 3)).toEqual([7, 4, 'UPDATE']);
  });

  it('404 when the term is gone', async () => {
    const { service } = make([]);
    await expect(service.update(7, dto, 1)).rejects.toThrow('LOGICAL_TERM_NOT_FOUND');
  });

  it('only replaces the physicals the form can see: mappings of inactive/deleted services stay', async () => {
    const { service, calls } = make([
      [/FROM data_hub_logical_terms lt WHERE lt.id = \$1/, () => [current]],
      lockPhysicals([{ id: 2, physical_column: 'name', logical_term_id: 7 }]),
      [/WHERE p.logical_term_id = \$1/, () => [{ id: 2 }]],
      [/RETURNING version_no/, () => [{ version_no: 5 }]],
      [/json_agg/, () => [snapshotRow]],
    ]);
    await service.update(7, { ...dto, short_description: 'new', physical_term_ids: [2] }, 5);
    const attachedSql = calls.find((c) => /WHERE p.logical_term_id = \$1/.test(c.sql))?.sql ?? '';
    expect(attachedSql).toContain("os.status = 'active'");
    expect(attachedSql).toContain('ov.id = os.active_version_id');
    // nothing detached: a hidden physical (not returned as attached) is never touched
    expect(calls.filter((c) => /SET logical_term_id = \$2/.test(c.sql))).toEqual([]);
  });
});
