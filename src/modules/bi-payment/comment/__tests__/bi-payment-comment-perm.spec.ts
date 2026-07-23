import 'reflect-metadata';
import { DATA_ACCESS_META_KEY, PERMISSION_META_KEY } from '@common/authorization/constants/authorization.constant';
import { BiPaymentCommentController } from '../bi-payment-comment.controller';
import { BiPaymentCommentService } from '../bi-payment-comment.service';

// Comment perm mapping — comment is an upload capability, not a view bonus.
describe('BiPaymentCommentController perm mapping', () => {
  const getPerm = (prop: string): string[] | undefined =>
    Reflect.getMetadata(PERMISSION_META_KEY, BiPaymentCommentController.prototype[prop]);
  const getDataAccess = (prop: string): { tableName: string; permissionCode?: string } | undefined =>
    Reflect.getMetadata(DATA_ACCESS_META_KEY, BiPaymentCommentController.prototype[prop]);

  it('list gắn bp_program_upload', () => expect(getPerm('list')).toEqual(['bp_program_upload']));
  it('create gắn bp_program_upload', () => expect(getPerm('create')).toEqual(['bp_program_upload']));
  it.each(['list', 'create'])('%s resolves program records for bp_program_upload only', (method) => {
    expect(getDataAccess(method)).toEqual({
      tableName: 'bi_payment_programs',
      permissionCode: 'bp_program_upload',
    });
  });
});

describe('BiPaymentCommentService program scope', () => {
  it('does not reinterpret explicit program ids as comment ids', async () => {
    const programWheres: string[] = [];
    const commentWheres: string[] = [];
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
    const commentRepo = { createQueryBuilder: jest.fn(() => makeQb(commentWheres)) };
    const programRepo = { createQueryBuilder: jest.fn(() => makeQb(programWheres)) };
    const service = new BiPaymentCommentService(commentRepo as any, programRepo as any);

    await service.list(7, 'preparing', { explicit: [7], ownedRoots: null });

    expect(programWheres.join(' | ')).toContain('pg.id = ANY');
    expect(commentWheres.join(' | ')).not.toContain('cm.id = ANY');
  });
});
