import { BadRequestException, ConflictException } from '@nestjs/common';
import { DH_PERMISSIONS as P } from '../../common/data-hub-permission-codes';
import { CreateConsumerDto } from '../../consumer/dto';
import { ConsumerImportService } from '../consumer-import.service';
import { CONSUMER_IMPORT_LAYOUT as LAYOUT } from '../import-layouts';
import { ConsumerImportTemplateService } from '../import-templates.service';
import { cellText } from '../import-workbook.util';
import { accessWith, CALLER, colOf, editSheet, letterOfKey, loadBook } from './import-test-helpers';

const EMAIL = { email: 'so@vpbank.com.vn' };
const ALL = [P.CONSUMER_CREATE, P.CONSUMER_UPDATE];

// `existing`: live apps already in the database, code -> id.
function harness(existing: Record<string, number> = {}, codes: string[] = ALL) {
  const dataSource = {
    query: jest.fn((sql: string) => {
      if (sql.includes('FROM data_hub_owner_units t')) return [{ code: 'Khối Vận hành' }];
      if (sql.includes('FROM data_hub_owner_units s')) return [{ id: 3, name: 'Khối Vận hành' }];
      if (sql.includes('FROM users u')) return [{ id: 9, email: 'so@vpbank.com.vn' }];
      if (sql.includes('FROM data_hub_consumers c'))
        return Object.entries(existing).map(([code, id]) => ({ id, code }));
      if (sql.includes('FROM data_hub_systems t')) return [{ code: 'OCP' }];
      if (sql.includes('FROM data_hub_systems s')) return [{ id: 2, name: 'OCP' }];
      return [];
    }),
  };
  const created: CreateConsumerDto[] = [];
  const writeService = {
    create: jest.fn((dto: CreateConsumerDto) => {
      created.push(dto);
      return Promise.resolve({ id: 100 + created.length, code: dto.code, version_no: 1 });
    }),
    update: jest.fn<Promise<{ id: number; version_no: number }>, [number, CreateConsumerDto, number]>((id) =>
      Promise.resolve({ id, version_no: 2 }),
    ),
  };
  const access = accessWith(...codes);
  const service = new ConsumerImportService(dataSource as never, writeService as never, access as never);
  const template = new ConsumerImportTemplateService(dataSource as never);
  return { service, template, writeService, created, access };
}

const example = async (h: ReturnType<typeof harness>) => h.template.build(EMAIL);
// One example file and the app codes in it (each download gets new codes).
async function exampleWithCodes(): Promise<{ file: Buffer; codes: string[] }> {
  const file = await harness().template.build(EMAIL);
  const wb = await loadBook(file);
  const c = colOf(LAYOUT, 'code');
  const codes = [2, 3].map((r) => cellText(wb.worksheets[0].getCell(r, c).value));
  return { file, codes };
}
const at = (issues: Array<{ column?: string; row: number; code: string }>, key: string, row: number) =>
  issues.filter((i) => i.column === letterOfKey(LAYOUT, key) && i.row === row).map((i) => i.code);

describe('ConsumerImportService', () => {
  it('dry run of the example: both rows will be created, nothing is written', async () => {
    const h = harness();
    const res = await h.service.import(await example(h), true, CALLER);
    expect(res.issues).toEqual([]);
    expect(res.summary.consumers).toEqual({ total: 2, valid: 2, created: 0, updated: 0, unchanged: 0, failed: 0 });
    expect(res.consumers.map((c) => [c.action, c.status])).toEqual([
      ['create', 'valid'],
      ['create', 'valid'],
    ]);
    expect(h.writeService.create).not.toHaveBeenCalled();
  });

  it('a new code creates the app with the upper-cased code and the ids resolved by name / email', async () => {
    const h = harness();
    const file = await editSheet(await example(h), LAYOUT, (s, col) => (s.getCell(2, col('code')).value = 'app_new_1'));
    const res = await h.service.import(file, false, CALLER);
    expect(res.summary.consumers.created).toBe(2);
    expect(h.created[0]).toMatchObject({
      code: 'APP_NEW_1',
      owner_unit_id: 3,
      so_app_user_ids: [9],
      system_id: 2,
      category: 'INTERNAL_APP',
    });
    expect(res.consumers[0]).toMatchObject({ action: 'create', status: 'created', id: 101, code: 'APP_NEW_1' });
  });

  it('an existing code (any case) updates that app with the row values; an empty optional cell clears it', async () => {
    const { file: sample, codes } = await exampleWithCodes();
    const [first] = codes;
    const h = harness({ [first]: 77 });
    const file = await editSheet(sample, LAYOUT, (s, col) => {
      s.getCell(2, col('code')).value = first.toLowerCase();
      s.getCell(2, col('name')).value = 'Tên mới';
      s.getCell(2, col('system_service')).value = null;
    });
    const res = await h.service.import(file, false, CALLER);
    expect(res.issues).toEqual([]);
    expect(h.writeService.update).toHaveBeenCalledTimes(1);
    const [id, dto, userId] = h.writeService.update.mock.calls[0];
    expect([id, userId]).toEqual([77, 1]);
    expect(dto).toMatchObject({ code: first, name: 'Tên mới', system_service: '' });
    expect(h.writeService.create).toHaveBeenCalledTimes(1);
    expect(res.summary.consumers).toMatchObject({ created: 1, updated: 1, failed: 0 });
    expect(res.consumers[0]).toMatchObject({ action: 'update', status: 'updated', id: 77, code: first });
  });

  it('an update with nothing to change is reported as unchanged, not as an error', async () => {
    const { file, codes } = await exampleWithCodes();
    const [first] = codes;
    const h = harness({ [first]: 77 });
    h.writeService.update.mockRejectedValueOnce(new BadRequestException('NO_CHANGES'));
    const res = await h.service.import(file, false, CALLER);
    expect(res.issues).toEqual([]);
    expect(res.consumers[0]).toMatchObject({ action: 'update', status: 'unchanged' });
    expect(res.summary.consumers).toMatchObject({ unchanged: 1, created: 1, failed: 0 });
    const out = await loadBook(Buffer.from(res.result_file.content_base64, 'base64'));
    const status = LAYOUT.sheets[0].columns.length + 1;
    expect(cellText(out.worksheets[0].getCell(2, status).value)).toBe('Không thay đổi');
    expect(cellText(out.worksheets[0].getCell(3, status).value)).toBe('Thành công');
  });

  it('each row needs the right of what it does: update rights alone cannot create, create alone cannot update', async () => {
    const { file, codes } = await exampleWithCodes();
    const [first] = codes;
    const onlyUpdate = harness({ [first]: 77 }, [P.CONSUMER_UPDATE]);
    const res = await onlyUpdate.service.import(file, false, CALLER);
    expect(at(res.issues, 'code', 2)).toEqual([]);
    expect(at(res.issues, 'code', 3)).toEqual(['PERMISSION_DENIED']);
    expect(onlyUpdate.writeService.update).toHaveBeenCalledTimes(1);
    expect(onlyUpdate.writeService.create).not.toHaveBeenCalled();

    const onlyCreate = harness({ [first]: 77 }, [P.CONSUMER_CREATE]);
    const res2 = await onlyCreate.service.import(file, false, CALLER);
    expect(at(res2.issues, 'code', 2)).toEqual(['PERMISSION_DENIED']);
    expect(onlyCreate.writeService.update).not.toHaveBeenCalled();
    expect(onlyCreate.writeService.create).toHaveBeenCalledTimes(1);
  });

  it('a code repeated in the file, a bad email and a bad category are reported by cell; nothing is written', async () => {
    const h = harness();
    const file = await editSheet(await example(h), LAYOUT, (s, col) => {
      s.getCell(2, col('code')).value = 'DUP_APP';
      s.getCell(3, col('code')).value = 'dup_app';
      s.getCell(3, col('category')).value = 'BAD';
      s.getCell(3, col('so_apps')).value = 'nobody@x.vn';
    });
    const res = await h.service.import(file, false, CALLER);
    expect(at(res.issues, 'code', 2)).toEqual(['DUPLICATE_IN_FILE']);
    expect(at(res.issues, 'code', 3)).toEqual(['DUPLICATE_IN_FILE']);
    expect(at(res.issues, 'category', 3)).toEqual(['INVALID_VALUE']);
    expect(at(res.issues, 'so_apps', 3)).toEqual(['USER_NOT_FOUND']);
    expect(h.writeService.create).not.toHaveBeenCalled();
  });

  it('every column required by the create API is required here; Dịch vụ hệ thống is optional', async () => {
    const required = LAYOUT.sheets[0].columns.filter((c) => c.level === 'r').map((c) => c.key);
    expect(required).toEqual(['code', 'name', 'system', 'category', 'owner_unit', 'so_apps', 'short_description']);
    const h = harness();
    const file = await editSheet(await example(h), LAYOUT, (s, col) => {
      for (const key of required) s.getCell(2, col(key)).value = null;
      s.getCell(2, col('system_service')).value = 'Chỉ có ô này';
    });
    const res = await h.service.import(file, false, CALLER);
    for (const key of required) expect(at(res.issues, key, 2)).toContain('REQUIRED');
    expect(h.created).toHaveLength(1);
  });

  it('resolves Đơn vị chủ quản and Hệ thống by name, ignoring case; unknown names are reported', async () => {
    const h = harness();
    const file = await editSheet(await example(h), LAYOUT, (s, col) => {
      s.getCell(2, col('owner_unit')).value = 'KHỐI VẬN HÀNH';
      s.getCell(2, col('system')).value = 'ocp';
      s.getCell(3, col('owner_unit')).value = 'Khối EDA';
      s.getCell(3, col('system')).value = 'NO_SUCH';
    });
    const res = await h.service.import(file, true, CALLER);
    expect(res.issues.map((i) => [i.row, i.code])).toEqual([
      [3, 'OWNER_UNIT_NOT_FOUND'],
      [3, 'SYSTEM_NOT_FOUND'],
    ]);
    expect(res.issues[0].message).toBe('Đơn vị chủ quản "Khối EDA" không tồn tại');
  });

  it('keeps going when one write fails', async () => {
    const h = harness();
    h.writeService.create.mockImplementationOnce(() => Promise.reject(new ConflictException('CONSUMER_CODE_EXISTS')));
    const res = await h.service.import(await example(h), false, CALLER);
    expect(res.consumers.map((c) => c.status)).toEqual(['failed', 'created']);
    expect(res.issues[0]).toMatchObject({ row: 2, code: 'CREATE_FAILED' });
  });
});
