import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { DataHubDataServiceController } from '../data-hub-data-service.controller';

function makeController() {
  const stub = () => jest.fn().mockResolvedValue({ ok: true });
  const listQuery = { list: stub(), stats: stub() };
  const termsQuery = { sourceTables: stub(), sourceTableTerms: stub() };
  const detailQuery = { detail: stub() };
  const historyService = { listHistories: stub(), historyDetail: stub(), listVersions: stub() };
  const writeService = { create: stub(), update: stub(), setStatus: stub() };
  const exportService = { export: stub() };
  const access = { canUpdateDataService: jest.fn().mockResolvedValue(true) };
  const controller = new DataHubDataServiceController(
    listQuery as never,
    detailQuery as never,
    termsQuery as never,
    historyService as never,
    writeService as never,
    exportService as never,
    access as never,
  );
  return { controller, listQuery, detailQuery, termsQuery, historyService, writeService, exportService, access };
}

const anonymous = { info: undefined } as never;
const asUser = (id: number) => ({ info: { user: { id, type: 'user' }, client: 'user' } }) as never;

describe('DataHubDataServiceController auth', () => {
  it.each<[string, (c: DataHubDataServiceController) => unknown]>([
    ['list', (c) => c.list({} as never, anonymous)],
    ['export', (c) => c.export({} as never, anonymous, {} as never)],
    ['create', (c) => c.create({} as never, anonymous)],
    ['detail', (c) => c.detail(1, anonymous)],
    ['sourceTables', (c) => c.sourceTables(1, {} as never, anonymous)],
    ['sourceTableTerms', (c) => c.sourceTableTerms(1, 2, anonymous)],
    ['update', (c) => c.update(1, {} as never, anonymous)],
    ['setStatus', (c) => c.setStatus(1, { status: 'active' } as never, anonymous)],
    ['histories', (c) => c.histories(1, {} as never, anonymous)],
    ['historyDetail', (c) => c.historyDetail(1, 2, anonymous)],
    ['versions', (c) => c.versions(1, {} as never, anonymous)],
  ])('%s rejects an unauthenticated request with 403', async (_name, call) => {
    const { controller } = makeController();
    await expect(Promise.resolve().then(() => call(controller))).rejects.toThrow(
      new ForbiddenException('User not authenticated'),
    );
  });

  it('passes the caller (id, type, client) to every write', async () => {
    const { controller, writeService } = makeController();
    const caller = { id: 7, type: 'user', client: 'user' };
    await controller.create({ name: 'n' } as never, asUser(7));
    await controller.update(3, { name: 'n' } as never, asUser(7));
    await controller.setStatus(3, { status: 'inactive' } as never, asUser(7));
    expect(writeService.create).toHaveBeenCalledWith({ name: 'n' }, caller);
    expect(writeService.update).toHaveBeenCalledWith(3, { name: 'n' }, caller);
    expect(writeService.setStatus).toHaveBeenCalledWith(3, 'inactive', caller);
  });

  it('detail adds is_update from the department-aware access check', async () => {
    const { controller, detailQuery, access } = makeController();
    detailQuery.detail.mockResolvedValue({ id: 3, version_active: { department: { id: 4, code: 'D', name: 'd' } } });
    access.canUpdateDataService.mockResolvedValue(false);
    await expect(controller.detail(3, asUser(7))).resolves.toMatchObject({ id: 3, is_update: false });
    expect(access.canUpdateDataService).toHaveBeenCalledWith({ id: 7, type: 'user', client: 'user' }, 4);
  });
});
