import { QueryFailedError } from 'typeorm';
import { makeSqlMock, SqlHandler } from '../../dictionary/__tests__/dictionary-test-helpers';
import { DepartmentConfigWriteService } from '../department-config-write.service';

const uniqueError = () =>
  new QueryFailedError(
    'q',
    [],
    Object.assign(new Error('dup'), { code: '23505', constraint: 'uq_data_hub_departments_code_live' }),
  );

const make = (handlers: SqlHandler[], liveUserIds: number[] = []) => {
  const mock = makeSqlMock(handlers);
  const assertUsers = jest.fn((_m: unknown, ids: number[]) =>
    ids.every((id) => liveUserIds.includes(id)) ? Promise.resolve() : Promise.reject(new Error('INVALID_USERS')),
  );
  return {
    ...mock,
    assertUsers,
    service: new DepartmentConfigWriteService(mock.dataSource as never, { assertUsers } as never),
  };
};

const LOCK = /FROM data_hub_departments d WHERE d.id = \$1/;
const live = { id: 5, code: 'DPD', name: 'Data Platform' };

describe('DepartmentConfigWriteService', () => {
  it('create inserts code + name + author and maps the case-insensitive unique index to 409', async () => {
    const ok = make([[/INSERT INTO data_hub_departments/, () => [{ id: 9 }]]]);
    await expect(ok.service.create({ code: 'NEW', name: 'New' }, 3)).resolves.toEqual({ id: 9 });
    expect(ok.calls[0].params).toEqual(['NEW', 'New', 3]);

    const dup = make([
      [
        /INSERT INTO data_hub_departments/,
        () => {
          throw uniqueError();
        },
      ],
    ]);
    await expect(dup.service.create({ code: 'dpd', name: 'x' }, 3)).rejects.toThrow('DEPARTMENT_CODE_EXISTS');
  });

  it('update locks the row, rejects no-op and missing rows', async () => {
    const { service, calls } = make([[LOCK, () => [live]]]);
    await expect(service.update(5, { code: 'DPD', name: 'Data Platform' }, 3)).rejects.toThrow('NO_CHANGES');
    expect(calls[0].sql).toContain('FOR UPDATE');
    await expect(make([]).service.update(5, { code: 'A', name: 'B' }, 3)).rejects.toThrow('DEPARTMENT_NOT_FOUND');
  });

  it('update writes the new values', async () => {
    const { service, calls } = make([[LOCK, () => [live]]]);
    await expect(service.update(5, { code: 'DPD2', name: 'Data Platform' }, 3)).resolves.toEqual({ id: 5 });
    const upd = calls.find((c) => /UPDATE data_hub_departments SET code/.test(c.sql));
    expect(upd?.params).toEqual([5, 'DPD2', 'Data Platform', 3]);
  });

  it('delete is refused while a live data service (active version) uses the department', async () => {
    const usedByService = make([
      [LOCK, () => [live]],
      [/FROM data_hub_data_services s/, () => [{ n: 1 }]],
    ]);
    await expect(usedByService.service.remove(5, 3)).rejects.toThrow('DEPARTMENT_IN_USE');
    expect(usedByService.calls[0].sql).toContain('FOR UPDATE');
    expect(usedByService.calls.some((c) => /SET deleted_at/.test(c.sql))).toBe(false);
    // consumers no longer have a department
    expect(usedByService.calls.some((c) => /FROM data_hub_consumers/.test(c.sql))).toBe(false);
  });

  it('delete soft-deletes the department and its live members, recording who deleted', async () => {
    const { service, calls } = make([[LOCK, () => [live]]]);
    await expect(service.remove(5, 3)).resolves.toEqual({ id: 5, deleted: true });
    expect(calls.some((c) => /UPDATE data_hub_departments SET deleted_at = NOW\(\), is_deleted = true/.test(c.sql))).toBe(
      true,
    );
    const members = calls.find((c) => /UPDATE data_hub_department_members m SET/.test(c.sql));
    expect(members?.sql).toContain('deleted_by = $2');
    expect(members?.params).toEqual([5, 3]);
    expect(calls.some((c) => /DELETE FROM data_hub_department_members/.test(c.sql))).toBe(false);
  });

  it('addMembers: department locked FOR SHARE, users must be live and hold a data-service right', async () => {
    const holders = [/FROM data_hub_dh_right_holders|WITH holders AS/, () => [{ user_id: 11 }]] as SqlHandler;
    const { service, calls } = make([[LOCK, () => [live]], holders], [11, 12]);
    await expect(service.addMembers(5, [11, 12], 3)).rejects.toThrow('INVALID_MEMBERS: 12');
    expect(calls[0].sql).toContain('FOR SHARE');
    expect(calls.some((c) => /INSERT INTO data_hub_department_members/.test(c.sql))).toBe(false);
  });

  it('addMembers inserts new pairs and revives soft-deleted ones, leaving live pairs alone', async () => {
    const holders = [/WITH holders AS/, () => [{ user_id: 11 }, { user_id: 12 }]] as SqlHandler;
    const { service, calls } = make(
      [[LOCK, () => [live]], holders, [/INSERT INTO data_hub_department_members/, () => [{ user_id: 12 }]]],
      [11, 12],
    );
    await expect(service.addMembers(5, [11, 12], 3)).resolves.toEqual({ id: 5, added: 1 });
    const ins = calls.find((c) => /INSERT INTO data_hub_department_members/.test(c.sql));
    expect(ins?.sql).toContain('ON CONFLICT (department_id, user_id) DO UPDATE');
    expect(ins?.sql).toContain('SET deleted_at = NULL, is_deleted = false, deleted_by = NULL');
    expect(ins?.sql).toContain('WHERE NOT (m.deleted_at IS NULL AND m.is_deleted IS NOT TRUE)');
    expect(ins?.params).toEqual([5, [11, 12], 3]);
  });

  it('addMembers on a missing department → 404', async () => {
    await expect(make([], [11]).service.addMembers(5, [11], 3)).rejects.toThrow('DEPARTMENT_NOT_FOUND');
  });

  it('removeMembers soft-deletes the given live links in one query, ignoring non-members', async () => {
    const ok = make([[/UPDATE data_hub_department_members m SET/, () => [[{ user_id: 11 }, { user_id: 12 }], 2]]]);
    await expect(ok.service.removeMembers(5, [11, 12, 99], 3)).resolves.toEqual({
      id: 5,
      removed: 2,
      user_ids: [11, 12],
    });
    const upd = ok.calls.find((c) => /UPDATE data_hub_department_members m SET/.test(c.sql));
    expect(upd?.sql).toContain('deleted_at = NOW(), is_deleted = true, deleted_by = $2');
    expect(upd?.sql).toContain('m.user_id = ANY($3::int[]) AND m.deleted_at IS NULL');
    expect(upd?.params).toEqual([5, 3, [11, 12, 99]]);
    expect(ok.calls.some((c) => /DELETE FROM data_hub_department_members/.test(c.sql))).toBe(false);
  });

  it('removeMembers 404s when none of the ids is a member', async () => {
    const missing = make([[/UPDATE data_hub_department_members m SET/, () => [[], 0]]]);
    await expect(missing.service.removeMembers(5, [11], 3)).rejects.toThrow('MEMBER_NOT_FOUND');
  });
});
