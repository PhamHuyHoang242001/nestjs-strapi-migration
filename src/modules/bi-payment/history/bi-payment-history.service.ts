import { applyDataScope } from '@modules/data-access/helpers/data-scope-applier';
import { BiPaymentProgramHistory } from '@modules/databases/bi-payment-program-history.entity';
import { BiPaymentProgramLogChange } from '@modules/databases/bi-payment-program-log-change.entity';
import { BiPaymentProjectHistory } from '@modules/databases/bi-payment-project-history.entity';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SearchBiPaymentProgramHistoryDto, SearchBiPaymentProjectHistoryDto } from './dto';
import type { DataScope } from '@common/authorization/types/data-scope.types';

const PROGRAM_HISTORY_TABLE = 'bi_payment_program_histories';
const PROGRAM_LOG_CHANGE_TABLE = 'bi_payment_program_log_changes';
const PROJECT_HISTORY_TABLE = 'bi_payment_project_histories';

// History + log-change — audit read-only. Record-scope qua subtree program/project.
@Injectable()
export class BiPaymentHistoryService {
  constructor(
    @InjectRepository(BiPaymentProgramHistory)
    private readonly programHistoryRepo: Repository<BiPaymentProgramHistory>,
    @InjectRepository(BiPaymentProgramLogChange)
    private readonly programLogChangeRepo: Repository<BiPaymentProgramLogChange>,
    @InjectRepository(BiPaymentProjectHistory)
    private readonly projectHistoryRepo: Repository<BiPaymentProjectHistory>,
  ) {}

  async listProgramHistory(query: SearchBiPaymentProgramHistoryDto, scope: DataScope | null) {
    const qb = this.programHistoryRepo
      .createQueryBuilder('h')
      .where('h.program_id = :pid', { pid: query.programId })
      .andWhere('h.deleted_at IS NULL');
    applyDataScope(qb, 'h', PROGRAM_HISTORY_TABLE, scope);
    if (query.keyword) qb.andWhere('h.name ILIKE :kw', { kw: `%${query.keyword.trim()}%` });
    qb.orderBy('h.changed_at', 'DESC');
    return qb.getMany();
  }

  async getProgramHistoryDetail(id: number, scope: DataScope | null) {
    const qb = this.programHistoryRepo.createQueryBuilder('h').where('h.id = :id', { id });
    applyDataScope(qb, 'h', PROGRAM_HISTORY_TABLE, scope);
    const history = await qb.getOne();
    if (!history) throw new NotFoundException('Program history not found');
    return history;
  }

  async listProgramLogChange(programId: number, scope: DataScope | null) {
    const qb = this.programLogChangeRepo
      .createQueryBuilder('l')
      .where('l.program_id = :pid', { pid: programId })
      .andWhere('l.deleted_at IS NULL');
    applyDataScope(qb, 'l', PROGRAM_LOG_CHANGE_TABLE, scope);
    qb.orderBy('l.changed_at', 'DESC');
    return qb.getMany();
  }

  async listProjectHistory(query: SearchBiPaymentProjectHistoryDto, scope: DataScope | null) {
    const qb = this.projectHistoryRepo
      .createQueryBuilder('h')
      .where('h.project_id = :pid', { pid: query.projectId })
      .andWhere('h.deleted_at IS NULL');
    applyDataScope(qb, 'h', PROJECT_HISTORY_TABLE, scope);
    qb.orderBy('h.changed_at', 'DESC');
    return qb.getMany();
  }
}
