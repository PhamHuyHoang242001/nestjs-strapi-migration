import { applyDataScope } from '@modules/data-access/helpers/data-scope-applier';
import { BiPaymentChecklist } from '@modules/databases/bi-payment-checklist.entity';
import { BiPaymentProgram } from '@modules/databases/bi-payment-program.entity';
import { BiPaymentChecklistStatus } from '@common/enums/bi-payment.enums';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateBiPaymentChecklistDto, UpdateBiPaymentChecklistDto } from './dto';
import type { DataScope } from '@common/authorization/types/data-scope.types';

const TABLE = 'bi_payment_checklists';
const PROGRAM_TABLE = 'bi_payment_programs';

// Checklist thuộc màn preparing — endpoint gắn bp_program_preparing (không code riêng).
@Injectable()
export class BiPaymentChecklistService {
  constructor(
    @InjectRepository(BiPaymentChecklist) private readonly repo: Repository<BiPaymentChecklist>,
    @InjectRepository(BiPaymentProgram) private readonly programRepo: Repository<BiPaymentProgram>,
  ) {}

  async list(programId: number, scope: DataScope | null) {
    await this.assertProgramInScope(programId, scope);
    const qb = this.repo
      .createQueryBuilder('c')
      .where('c.program_id = :pid', { pid: programId })
      .andWhere('c.deleted_at IS NULL');
    applyDataScope(qb, 'c', TABLE, scope);
    return qb.getMany();
  }

  async create(programId: number, dto: CreateBiPaymentChecklistDto, scope: DataScope | null, userId?: number) {
    await this.assertProgramInScope(programId, scope);
    const entity = this.repo.create({
      ...dto,
      program_id: programId,
      checklist_created_by_id: userId ?? null,
    } as unknown as Partial<BiPaymentChecklist>);
    const saved = await this.repo.save(entity);
    return { id: saved.id };
  }

  async update(id: number, dto: UpdateBiPaymentChecklistDto, scope: DataScope | null, userId?: number) {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Checklist not found');
    await this.assertProgramInScope(item.program_id, scope);
    Object.assign(item, dto, { checklist_updated_by_id: userId ?? item.checklist_updated_by_id });
    await this.repo.save(item);
    return { id: item.id };
  }

  async delete(id: number, scope: DataScope | null) {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Checklist not found');
    await this.assertProgramInScope(item.program_id, scope);
    await this.repo.softRemove(item);
    return { id: item.id };
  }

  // Approve — gộp vào _preparing, không code riêng (bp_checklist_approve đã bỏ).
  async approve(id: number, scope: DataScope | null) {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Checklist not found');
    await this.assertProgramInScope(item.program_id, scope);
    item.checklist_status = BiPaymentChecklistStatus.ACTIVE;
    await this.repo.save(item);
    return { id: item.id, checklist_status: item.checklist_status };
  }

  private async assertProgramInScope(programId: number | null, scope: DataScope | null): Promise<void> {
    if (scope === null || programId === null) return;
    const qb = this.programRepo
      .createQueryBuilder('pg')
      .select('1', 'one')
      .where('pg.id = :pid', { pid: programId });
    applyDataScope(qb, 'pg', PROGRAM_TABLE, scope);
    const ok = await qb.getRawOne();
    if (!ok) throw new ForbiddenException('No permission');
  }
}
