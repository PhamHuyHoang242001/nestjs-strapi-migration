import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DH_PERMISSIONS as P } from '../../common/data-hub-permission-codes';
import { LogicalTermBodyDto } from '../../dictionary/dto';
import { LogicalTermImportRowDto } from '../import-dto';
import { LOGICAL_TERM_IMPORT_LAYOUT as LAYOUT } from '../import-layouts';
import { LogicalTermImportTemplateService } from '../import-templates.service';
import { cellText } from '../import-workbook.util';
import { LogicalTermImportService } from '../logical-term-import.service';
import { accessWith, CALLER, colOf, editSheet, letterOfKey, loadBook } from './import-test-helpers';

type Body = { code: string; short_description: string; example_value: string | null; physical_term_ids: number[] };

// `existing`: live logical terms, code -> id; `mapped`: physical term ids of active services mapped to them.
function harness(
  existing: Record<string, number> = {},
  codes: string[] = [P.LOGICAL_TERM_CREATE, P.LOGICAL_TERM_UPDATE],
) {
  const mapped = [31, 32];
  const dataSource = {
    query: jest.fn((sql: string) => {
      if (sql.includes('FROM data_hub_logical_terms t')) {
        return Object.entries(existing).map(([code, id]) => ({ id, code }));
      }
      if (sql.includes('FROM data_hub_physical_terms p')) return mapped.map((id) => ({ id }));
      return [];
    }),
  };
  const writeService = {
    create: jest.fn<Promise<{ id: number; code: string; version_no: number }>, [Body, number]>((dto) =>
      Promise.resolve({ id: 500, code: dto.code, version_no: 1 }),
    ),
    update: jest.fn<Promise<{ id: number; version_no: number }>, [number, Body, number]>((id) =>
      Promise.resolve({ id, version_no: 2 }),
    ),
  };
  const access = accessWith(...codes);
  return {
    service: new LogicalTermImportService(dataSource as never, writeService as never, access as never),
    writeService,
  };
}

async function exampleWithCodes(): Promise<{ file: Buffer; codes: string[] }> {
  const file = await new LogicalTermImportTemplateService().build(true);
  const wb = await loadBook(file);
  const c = colOf(LAYOUT, 'code');
  return { file, codes: [2, 3].map((r) => cellText(wb.worksheets[0].getCell(r, c).value)) };
}

const at = (issues: Array<{ column?: string; row: number; code: string }>, key: string, row: number) =>
  issues.filter((i) => i.column === letterOfKey(LAYOUT, key) && i.row === row).map((i) => i.code);

describe('LogicalTermImportService', () => {
  it('a new code creates the term with an empty physical mapping', async () => {
    const { file } = await exampleWithCodes();
    const h = harness();
    const res = await h.service.import(file, false, CALLER);
    expect(res.issues).toEqual([]);
    expect(res.summary.logical_terms).toEqual({ total: 2, valid: 2, created: 2, updated: 0, unchanged: 0, failed: 0 });
    expect(h.writeService.create.mock.calls[0]).toEqual([expect.objectContaining({ physical_term_ids: [] }), 1]);
  });

  it('an existing code (any case) updates description / example and keeps the mapped physical terms', async () => {
    const { file: sample, codes } = await exampleWithCodes();
    const h = harness({ [codes[0]]: 40 });
    const file = await editSheet(sample, LAYOUT, (s, col) => {
      s.getCell(2, col('code')).value = codes[0].toLowerCase();
      s.getCell(2, col('short_description')).value = 'Mô tả mới';
      s.getCell(2, col('example_value')).value = null;
    });
    const res = await h.service.import(file, false, CALLER);
    expect(res.issues).toEqual([]);
    expect(h.writeService.update).toHaveBeenCalledTimes(1);
    const [id, body, userId] = h.writeService.update.mock.calls[0];
    expect([id, userId]).toEqual([40, 1]);
    // The empty example cell clears the example; the mapping sent back is the current one.
    expect(body).toMatchObject({ short_description: 'Mô tả mới', example_value: null, physical_term_ids: [31, 32] });
    expect(res.summary.logical_terms).toMatchObject({ created: 1, updated: 1 });
    expect(res.logical_terms[0]).toMatchObject({ action: 'update', status: 'updated', id: 40 });
  });

  it('an update with nothing to change is unchanged, not an error', async () => {
    const { file, codes } = await exampleWithCodes();
    const h = harness({ [codes[0]]: 40 });
    h.writeService.update.mockRejectedValueOnce(new BadRequestException('NO_CHANGES'));
    const res = await h.service.import(file, false, CALLER);
    expect(res.issues).toEqual([]);
    expect(res.logical_terms.map((t) => t.status)).toEqual(['unchanged', 'created']);
  });

  it('each row needs the right of what it does', async () => {
    const { file, codes } = await exampleWithCodes();
    const h = harness({ [codes[0]]: 40 }, [P.LOGICAL_TERM_CREATE]);
    const res = await h.service.import(file, false, CALLER);
    expect(at(res.issues, 'code', 2)).toEqual(['PERMISSION_DENIED']);
    expect(at(res.issues, 'code', 3)).toEqual([]);
    expect(h.writeService.update).not.toHaveBeenCalled();
    expect(h.writeService.create).toHaveBeenCalledTimes(1);
  });

  it('dry run writes nothing; a code repeated in the file and an empty required cell are errors', async () => {
    const { file: sample } = await exampleWithCodes();
    const h = harness();
    const file = await editSheet(sample, LAYOUT, (s, col) => {
      s.getCell(2, col('code')).value = 'A_NEW';
      s.getCell(3, col('code')).value = 'a_new';
      s.getCell(3, col('short_description')).value = null;
    });
    const res = await h.service.import(file, true, CALLER);
    expect(at(res.issues, 'code', 2)).toEqual(['DUPLICATE_IN_FILE']);
    expect(at(res.issues, 'code', 3)).toEqual(['DUPLICATE_IN_FILE']);
    expect(at(res.issues, 'short_description', 3)).toContain('REQUIRED');
    expect(h.writeService.create).not.toHaveBeenCalled();
    expect(h.writeService.update).not.toHaveBeenCalled();
  });

  it('required columns follow the create API: code and description; example is optional', () => {
    const levels = LAYOUT.sheets[0].columns.map((c) => [c.key, c.level]);
    expect(levels).toEqual([
      ['stt', 'o'],
      ['code', 'r'],
      ['short_description', 'r'],
      ['example_value', 'o'],
    ]);
  });
});

describe('a logical term needs no physical term', () => {
  const body = { code: 'X', short_description: 'd' };
  it('LogicalTermBodyDto accepts an empty or omitted mapping (omitted = []), still validates given ids', async () => {
    expect(await validate(plainToInstance(LogicalTermBodyDto, { ...body, physical_term_ids: [] }))).toEqual([]);
    const omitted = plainToInstance(LogicalTermBodyDto, body);
    expect(await validate(omitted)).toEqual([]);
    expect(omitted.physical_term_ids).toEqual([]);
    const bad = await validate(plainToInstance(LogicalTermBodyDto, { ...body, physical_term_ids: [0, 0] }));
    expect(bad.map((e) => e.property)).toEqual(['physical_term_ids']);
    expect(await validate(plainToInstance(LogicalTermImportRowDto, { ...body, example_value: null }))).toEqual([]);
  });
});
