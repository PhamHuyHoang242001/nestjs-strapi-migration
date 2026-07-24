import 'reflect-metadata';
import { DATA_ACCESS_META_KEY, PERMISSION_META_KEY } from '@common/authorization/constants/authorization.constant';
import { BiPaymentChecklistController } from '../bi-payment-checklist.controller';
import { BiPaymentChecklistService } from '../bi-payment-checklist.service';

// Checklist list is a screen-read dependency; writes stay capability-gated.
describe('BiPaymentChecklistController perm mapping', () => {
  const getPerm = (prop: string): string[] | undefined =>
    Reflect.getMetadata(PERMISSION_META_KEY, BiPaymentChecklistController.prototype[prop]);
  const getDataAccess = (prop: string): unknown =>
    Reflect.getMetadata(DATA_ACCESS_META_KEY, BiPaymentChecklistController.prototype[prop]);

  it('list opens with view while preserving upload-only backward compatibility', () =>
    expect(getPerm('list')).toEqual(['bp_program_view', 'bp_program_upload']));
  it('list resolves content capability in the service instead of one-code data-access metadata', () =>
    expect(getDataAccess('list')).toBeUndefined());
  it('create gắn bp_program_upload', () => expect(getPerm('create')).toEqual(['bp_program_upload']));
  it('update gắn bp_program_upload', () => expect(getPerm('update')).toEqual(['bp_program_upload']));
  it('delete gắn bp_program_upload', () => expect(getPerm('delete')).toEqual(['bp_program_upload']));
  it('approve gắn bp_program_approve', () => expect(getPerm('approve')).toEqual(['bp_program_approve']));
});

describe('BiPaymentChecklistService program scope', () => {
  it('returns an empty list for a view-only caller', async () => {
    const checklistRepo = {
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([{ id: 10, program_id: 7 }]),
      })),
    };
    const stepScope = { hasProgramCapability: jest.fn().mockResolvedValue(false) };
    const service = new (BiPaymentChecklistService as any)(checklistRepo, {}, stepScope);

    await expect((service as any).list(7, null, 5, { isAdmin: false })).resolves.toEqual([]);
    expect(stepScope.hasProgramCapability).toHaveBeenCalledWith(5, 7, 'bp_program_upload');
    expect(checklistRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('returns checklist rows when upload capability exists at the program', async () => {
    const rows = [{ id: 10, program_id: 7 }];
    const checklistRepo = {
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(rows),
      })),
    };
    const stepScope = { hasProgramCapability: jest.fn().mockResolvedValue(true) };
    const service = new (BiPaymentChecklistService as any)(checklistRepo, {}, stepScope);

    await expect((service as any).list(7, null, 5, { isAdmin: false })).resolves.toEqual(rows);
  });

  it('keeps the super-admin list bypass aligned with PermissionGuard', async () => {
    const rows = [{ id: 10, program_id: 7 }];
    const checklistRepo = {
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(rows),
      })),
    };
    const stepScope = { hasProgramCapability: jest.fn() };
    const service = new (BiPaymentChecklistService as any)(checklistRepo, {}, stepScope);

    await expect((service as any).list(7, null, undefined, { isAdmin: true })).resolves.toEqual(rows);
    expect(stepScope.hasProgramCapability).not.toHaveBeenCalled();
  });

  it('does not reinterpret explicit program ids as checklist ids', async () => {
    const programWheres: string[] = [];
    const checklistWheres: string[] = [];
    const makeQb = (wheres: string[]) => {
      const qb: any = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn((sql: string) => {
          wheres.push(sql);
          return qb;
        }),
        andWhere: jest.fn((sql: string) => {
          wheres.push(sql);
          return qb;
        }),
        setParameter: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ one: 1 }),
        getMany: jest.fn().mockResolvedValue([]),
      };
      return qb;
    };
    const checklistRepo = { createQueryBuilder: jest.fn(() => makeQb(checklistWheres)) };
    const programRepo = { createQueryBuilder: jest.fn(() => makeQb(programWheres)) };
    const stepScope = { hasProgramCapability: jest.fn().mockResolvedValue(true) };
    const service = new (BiPaymentChecklistService as any)(checklistRepo, programRepo, stepScope);

    await service.list(7, { explicit: [7], ownedRoots: null }, 5, { isAdmin: false });

    expect(programWheres.join(' | ')).toContain('pg.id = ANY');
    expect(checklistWheres.join(' | ')).not.toContain('c.id = ANY');
  });

  it('approves checklist rows by programId instead of treating it as a checklist id', async () => {
    const rows = [
      { id: 10, program_id: 7 },
      { id: 11, program_id: 7 },
    ];
    const checklistRepo = {
      find: jest.fn().mockResolvedValue(rows),
      save: jest.fn(async (items: unknown) => items),
    };
    const service = new BiPaymentChecklistService(checklistRepo as any, {} as any, {} as any);

    await expect(service.approve(7, null)).resolves.toEqual({ programId: 7, success: 2 });
    expect(checklistRepo.find).toHaveBeenCalledWith({
      where: { program_id: 7, deleted_at: expect.anything() },
    });
    expect(rows.every((row: any) => row.checklist_status === 'active')).toBe(true);
  });
});
