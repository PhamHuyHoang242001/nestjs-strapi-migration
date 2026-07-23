import { applyDataScope } from '@modules/data-access/helpers/data-scope-applier';
import { BiPaymentComment } from '@modules/databases/bi-payment-comment.entity';
import { BiPaymentProgram } from '@modules/databases/bi-payment-program.entity';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateBiPaymentCommentDto } from './dto';
import type { DataScope } from '@common/authorization/types/data-scope.types';

const PROGRAM_TABLE = 'bi_payment_programs';

// Comment ăn theo workstep — endpoint tách theo workstep (preparing/reconciliation/...).
@Injectable()
export class BiPaymentCommentService {
  constructor(
    @InjectRepository(BiPaymentComment) private readonly repo: Repository<BiPaymentComment>,
    @InjectRepository(BiPaymentProgram) private readonly programRepo: Repository<BiPaymentProgram>,
  ) {}

  async list(programId: number, workstep: string, scope: DataScope | null) {
    await this.assertProgramInScope(programId, scope);
    const qb = this.repo
      .createQueryBuilder('cm')
      .where('cm.program_id = :pid', { pid: programId })
      .andWhere('cm.workstep = :ws', { ws: workstep })
      .andWhere('cm.deleted_at IS NULL');
    return qb.getMany();
  }

  async create(
    programId: number,
    workstep: string,
    dto: CreateBiPaymentCommentDto,
    scope: DataScope | null,
    userId?: number,
  ) {
    await this.assertProgramInScope(programId, scope);
    const entity = this.repo.create({
      value: dto.value,
      workstep,
      program_id: programId,
      user_created_by_id: userId ?? null,
    } as unknown as Partial<BiPaymentComment>);
    const saved = await this.repo.save(entity);
    return { id: saved.id };
  }

  private async assertProgramInScope(programId: number, scope: DataScope | null): Promise<void> {
    if (scope === null) return;
    const qb = this.programRepo.createQueryBuilder('pg').select('1', 'one').where('pg.id = :pid', { pid: programId });
    applyDataScope(qb, 'pg', PROGRAM_TABLE, scope);
    const ok = await qb.getRawOne<{ one: number }>();
    if (!ok) throw new ForbiddenException('No permission');
  }
}
