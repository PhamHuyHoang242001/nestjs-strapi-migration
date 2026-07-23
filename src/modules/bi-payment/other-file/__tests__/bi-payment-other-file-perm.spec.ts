import 'reflect-metadata';
import { DATA_ACCESS_META_KEY, PERMISSION_META_KEY } from '@common/authorization/constants/authorization.constant';
import { BiPaymentOtherFileController } from '../bi-payment-other-file.controller';
import { BiPaymentOtherFileService } from '../bi-payment-other-file.service';

// Other-file perm mapping — all endpoints gate bp_program_upload.
describe('BiPaymentOtherFileController perm mapping', () => {
  const getPerm = (prop: string): string[] | undefined =>
    Reflect.getMetadata(PERMISSION_META_KEY, BiPaymentOtherFileController.prototype[prop]);
  const getDataAccess = (prop: string): { tableName: string; permissionCode?: string } | undefined =>
    Reflect.getMetadata(DATA_ACCESS_META_KEY, BiPaymentOtherFileController.prototype[prop]);

  it('search gắn bp_program_upload', () => expect(getPerm('search')).toEqual(['bp_program_upload']));
  it('userCreated gắn bp_program_upload', () => expect(getPerm('userCreated')).toEqual(['bp_program_upload']));
  it('upload gắn bp_program_upload', () => expect(getPerm('upload')).toEqual(['bp_program_upload']));
  it('delete gắn bp_program_upload', () => expect(getPerm('delete')).toEqual(['bp_program_upload']));
  it('downloadMultiple gắn bp_program_upload', () =>
    expect(getPerm('downloadMultiple')).toEqual(['bp_program_upload']));
  it.each(['search', 'userCreated', 'downloadMultiple', 'upload', 'delete'])(
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
    const service = new BiPaymentOtherFileService(repo as any, {} as any);

    await service.list({ programId: 7 } as any, { explicit: [7], ownedRoots: null });

    expect(qb.innerJoin).toHaveBeenCalledWith('cl.program', 'pg', 'pg.deleted_at IS NULL');
    expect(wheres.join(' | ')).toContain('pg.id = ANY');
    expect(wheres.join(' | ')).not.toContain('f.id = ANY');
  });
});
