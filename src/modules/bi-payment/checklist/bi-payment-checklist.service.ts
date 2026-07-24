import { applyDataScope } from '@modules/data-access/helpers/data-scope-applier';
import { BiPaymentChecklist } from '@modules/databases/bi-payment-checklist.entity';
import { BiPaymentProgram } from '@modules/databases/bi-payment-program.entity';
import { BiPaymentChecklistStatus } from '@common/enums/bi-payment.enums';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { CreateBiPaymentChecklistDto, UpdateBiPaymentChecklistDto } from './dto';
import type { DataScope } from '@common/authorization/types/data-scope.types';
import { StepScopeService } from '../common/step-scope.service';

const PROGRAM_TABLE = 'bi_payment_programs';
const UPLOAD_CODE = 'bp_program_upload';
type AdminFlag = { isAdmin: boolean };

// Checklist content is managed by full upload; approval uses the dedicated approve capability.
@Injectable()
export class BiPaymentChecklistService {
  constructor(
    @InjectRepository(BiPaymentChecklist) private readonly repo: Repository<BiPaymentChecklist>,
    @InjectRepository(BiPaymentProgram) private readonly programRepo: Repository<BiPaymentProgram>,
    private readonly stepScope: StepScopeService,
  ) {}

  async list(programId: number, scope: DataScope | null, userId?: number, admin: AdminFlag = { isAdmin: false }) {
    if (!admin.isAdmin && (!userId || !(await this.stepScope.hasProgramCapability(userId, programId, UPLOAD_CODE)))) {
      return [];
    }
    await this.assertProgramInScope(programId, scope);
    const qb = this.repo
      .createQueryBuilder('c')
      .where('c.program_id = :pid', { pid: programId })
      .andWhere('c.deleted_at IS NULL');
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

  // Approve checklist after the controller enforces the dedicated capability.
  async approve(programId: number, scope: DataScope | null) {
    await this.assertProgramInScope(programId, scope);
    const items = await this.repo.find({ where: { program_id: programId, deleted_at: IsNull() } });
    if (!items.length) throw new NotFoundException('Checklist not found');
    for (const item of items) item.checklist_status = BiPaymentChecklistStatus.ACTIVE;
    await this.repo.save(items);
    return { programId, success: items.length };
  }

  private async assertProgramInScope(programId: number | null, scope: DataScope | null): Promise<void> {
    if (scope === null || programId === null) return;
    const qb = this.programRepo.createQueryBuilder('pg').select('1', 'one').where('pg.id = :pid', { pid: programId });
    applyDataScope(qb, 'pg', PROGRAM_TABLE, scope);
    const ok = await qb.getRawOne<{ one: number }>();
    if (!ok) throw new ForbiddenException('No permission');
  }
}
