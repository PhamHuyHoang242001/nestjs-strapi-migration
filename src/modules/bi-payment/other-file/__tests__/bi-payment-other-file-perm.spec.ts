import 'reflect-metadata';
import { DATA_ACCESS_META_KEY, PERMISSION_META_KEY } from '@common/authorization/constants/authorization.constant';
import { BiPaymentOtherFileController } from '../bi-payment-other-file.controller';
import { BiPaymentOtherFileService } from '../bi-payment-other-file.service';

// Other-file list is a screen-read dependency; content/mutations stay upload-only.
describe('BiPaymentOtherFileController perm mapping', () => {
  const getPerm = (prop: string): string[] | undefined =>
    Reflect.getMetadata(PERMISSION_META_KEY, BiPaymentOtherFileController.prototype[prop]);
  const getDataAccess = (prop: string): { tableName: string; permissionCode?: string } | undefined =>
    Reflect.getMetadata(DATA_ACCESS_META_KEY, BiPaymentOtherFileController.prototype[prop]);

  it('search opens with view while preserving upload-only backward compatibility', () =>
    expect(getPerm('search')).toEqual(['bp_program_view', 'bp_program_upload']));
  it('search resolves content capability in the service instead of one-code data-access metadata', () =>
    expect(getDataAccess('search')).toBeUndefined());
  it('userCreated gắn bp_program_upload', () => expect(getPerm('userCreated')).toEqual(['bp_program_upload']));
  it('upload gắn bp_program_upload', () => expect(getPerm('upload')).toEqual(['bp_program_upload']));
  it('delete gắn bp_program_upload', () => expect(getPerm('delete')).toEqual(['bp_program_upload']));
  it('downloadMultiple gắn bp_program_upload', () =>
    expect(getPerm('downloadMultiple')).toEqual(['bp_program_upload']));
  it.each(['userCreated', 'downloadMultiple', 'upload', 'delete'])(
    '%s resolves upload records at the program level',
    (method) => {
      expect(getDataAccess(method)).toEqual({
        tableName: 'bi_payment_programs',
        permissionCode: 'bp_program_upload',
      });
    },
  );
});

describe('BiPaymentOtherFileService program scope', () => {
  it('returns an empty list for a view-only caller', async () => {
    const repo = {
      createQueryBuilder: jest.fn(() => ({
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([{ id: 1 }]),
      })),
    };
    const stepScope = { hasProgramCapability: jest.fn().mockResolvedValue(false) };
    const service = new (BiPaymentOtherFileService as any)(repo, {}, stepScope);

    await expect((service as any).list({ programId: 7 }, null, 5, { isAdmin: false })).resolves.toEqual([]);
    expect(stepScope.hasProgramCapability).toHaveBeenCalledWith(5, 7, 'bp_program_upload');
    expect(repo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('returns other-file rows when upload capability exists at the program', async () => {
    const rows = [{ id: 1 }];
    const qb: any = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(rows),
    };
    const repo = { createQueryBuilder: jest.fn(() => qb) };
    const stepScope = { hasProgramCapability: jest.fn().mockResolvedValue(true) };
    const service = new (BiPaymentOtherFileService as any)(repo, {}, stepScope);

    await expect((service as any).list({ programId: 7 }, null, 5, { isAdmin: false })).resolves.toEqual(rows);
  });

  it('keeps the super-admin list bypass aligned with PermissionGuard', async () => {
    const rows = [{ id: 1 }];
    const qb: any = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(rows),
    };
    const repo = { createQueryBuilder: jest.fn(() => qb) };
    const stepScope = { hasProgramCapability: jest.fn() };
    const service = new (BiPaymentOtherFileService as any)(repo, {}, stepScope);

    await expect((service as any).list({ programId: 7 }, null, undefined, { isAdmin: true })).resolves.toEqual(rows);
    expect(stepScope.hasProgramCapability).not.toHaveBeenCalled();
  });

  it('applies explicit program ids to the joined program, not other-file ids', async () => {
    const wheres: string[] = [];
    const qb: any = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn((sql: string) => {
        wheres.push(sql);
        return qb;
      }),
      andWhere: jest.fn((sql: string) => {
        wheres.push(sql);
        return qb;
      }),
      setParameter: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    const repo = { createQueryBuilder: jest.fn(() => qb) };
    const stepScope = { hasProgramCapability: jest.fn().mockResolvedValue(true) };
    const service = new (BiPaymentOtherFileService as any)(repo, {}, stepScope);

    await service.list({ programId: 7 } as any, { explicit: [7], ownedRoots: null }, 5, { isAdmin: false });

    expect(qb.innerJoin).toHaveBeenCalledWith('cl.program', 'pg', 'pg.deleted_at IS NULL');
    expect(wheres.join(' | ')).toContain('pg.id = ANY');
    expect(wheres.join(' | ')).not.toContain('f.id = ANY');
  });
});
