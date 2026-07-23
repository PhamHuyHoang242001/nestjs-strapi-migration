import { PaginationParams } from '@common/decorators/pagination.decorator';
import { SortCamelParams } from '../common/decorators/sort-camel.decorator';
import { mapCamelToSnake } from '../common/helpers/camel-snake.mapper';
import { execQueryPaignation } from '@common/utils';
import { applyDataScope } from '@modules/data-access/helpers/data-scope-applier';
import { CreatorAccessGrantService } from '@modules/data-access/services/creator-access-grant.service';
import { BiPaymentProgram } from '@modules/databases/bi-payment-program.entity';
import { BiPaymentProgramPicConfirm } from '@modules/databases/bi-payment-program-pic-confirm.entity';
import { BiPaymentCalculatingStatus, BiPaymentWorkstepCurrent } from '@common/enums/bi-payment.enums';
import { OwnerScopeResolverService } from '@common/authorization/services/owner-scope-resolver.service';
import { DATA_ACCESS_TABLE } from '@common/enums';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { CreateBiPaymentProgramDto, NextStepDto, SearchBiPaymentProgramDto, UpdateBiPaymentProgramDto } from './dto';
import { isValidTransition } from './constants/workstep-transition';
import type { DataScope } from '@common/authorization/types/data-scope.types';

const PROGRAM_TABLE = 'bi_payment_programs';
const CREATE_PERMISSION = 'bp_program_create';

// Mapping camelCase DTO (Strapi parity) → snake_case entity cols cho program.
const PROGRAM_FIELD_MAPPING: Record<string, string> = {
  calculatingStatus: 'calculating_status',
  calculatingReportLink: 'calculating_report_link',
  calculatingStartingDate: 'calculating_starting_date',
  calculatingEndingDate: 'calculating_ending_date',
  feedbackLink: 'feedback_link',
  linkReportFinal: 'link_report_final',
  workstepCurrent: 'workstep_current',
  programStatus: 'program_status',
  programType: 'program_type',
  progressStatus: 'progress_status',
  preparingUpFileStartingDate: 'preparing_up_file_starting_date',
  preparingUpFileEndingDate: 'preparing_up_file_ending_date',
  issueFileStartingDate: 'issue_file_starting_date',
  issueFileEndingDate: 'issue_file_ending_date',
  isApplyUploadFile: 'is_apply_upfile_preparing_data',
  reportLink: 'calculating_report_link',
  sendNoti: 'send_noti',
};

@Injectable()
export class BiPaymentProgramService {
  constructor(
    @InjectRepository(BiPaymentProgram)
    private readonly programRepo: Repository<BiPaymentProgram>,
    private readonly dataSource: DataSource,
    private readonly creatorAccessGrant: CreatorAccessGrantService,
    private readonly ownerScope: OwnerScopeResolverService,
  ) {}

  async search(
    query: SearchBiPaymentProgramDto,
    sortParams: SortCamelParams,
    pagination: PaginationParams,
    scope: DataScope | null,
  ) {
    const qb = this.programRepo.createQueryBuilder('pg').where('pg.deleted_at IS NULL');

    applyDataScope(qb, 'pg', PROGRAM_TABLE, scope);

    if (query.keyword) {
      const kw = query.keyword.trim();
      qb.andWhere('(pg.code ILIKE :kw OR pg.name ILIKE :kw)', { kw: `%${kw}%` });
    }
    if (query.projectId) qb.andWhere('pg.project_id = :projectId', { projectId: query.projectId });
    if (query.workstepCurrent) qb.andWhere('pg.workstep_current = :ws', { ws: query.workstepCurrent });
    if (query.biccDepartmentId) qb.andWhere('pg.project.bicc_department_id = :bdid', { bdid: query.biccDepartmentId });
    if (query.categoryIds) {
      const catIds = query.categoryIds
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => n > 0);
      if (catIds.length)
        qb.andWhere(
          'pg.id IN (SELECT program_id FROM bi_payment_programs_categories WHERE bi_payment_category_id IN (:...catIds))',
          { catIds },
        );
    }

    qb.orderBy(`pg.${sortParams.sort_field}`, sortParams.sort_order as 'ASC' | 'DESC');
    return execQueryPaignation(qb, pagination.page, pagination.limit);
  }

  async details(id: number, scope: DataScope | null) {
    const program = await this.programRepo
      .createQueryBuilder('pg')
      .leftJoinAndSelect('pg.checklists', 'checklists')
      .leftJoinAndSelect('pg.work_steps', 'work_steps')
      .leftJoinAndSelect('pg.bi_payment_program_pic_confirms', 'pic_confirms')
      .where('pg.id = :id', { id })
      .getOne();
    if (!program) throw new NotFoundException('BI Payment program not found');
    await this.assertInScope(id, scope);
    return program;
  }

  // Parent-scope gate: the target project must be bound (via role or user allow-grant) to a
  // holder of the create verb, or fall within the caller's SO owned scope. super_admin bypasses.
  // Record does not exist yet, so the check is on the parent bi_payment_projects, not via @RequireOwnerScope.
  async create(dto: CreateBiPaymentProgramDto, userId: number, isSuperAdmin: boolean) {
    if (!isSuperAdmin) {
      const allowed = await this.ownerScope.canCreateUnderParent(
        userId,
        DATA_ACCESS_TABLE.BI_PAYMENT_PROJECTS,
        dto.projectId,
        CREATE_PERMISSION,
      );
      if (!allowed) {
        throw new ForbiddenException('Out of create scope for bi_payment_projects');
      }
    }

    let accessGranted = false;
    const result = await this.dataSource.transaction(async (manager) => {
      const entity = manager.create(BiPaymentProgram, dto as unknown as Partial<BiPaymentProgram>);
      const saved = await manager.save(entity);
      if (userId) {
        accessGranted = await this.creatorAccessGrant.grantCreatorAccess(manager, {
          tableName: PROGRAM_TABLE,
          dataId: saved.id,
          userId,
        });
      }
      return { id: saved.id };
    });
    if (accessGranted) {
      this.creatorAccessGrant.invalidateUserCache(userId).catch(() => {});
    }
    return result;
  }

  async update(id: number, dto: UpdateBiPaymentProgramDto, scope: DataScope | null) {
    const program = await this.programRepo.findOne({ where: { id } });
    if (!program) throw new NotFoundException('BI Payment program not found');
    await this.assertInScope(id, scope);
    Object.assign(program, dto);
    await this.programRepo.save(program);
    return { id: program.id };
  }

  async delete(id: number, scope: DataScope | null) {
    const program = await this.programRepo.findOne({ where: { id } });
    if (!program) throw new NotFoundException('BI Payment program not found');
    await this.assertInScope(id, scope);
    await this.programRepo.softRemove(program);
    return { id: program.id };
  }

  // Đẩy workstep_current sang step kế. Validate transition.
  // Caller is already protected by the program edit verb and data-access scope.
  async nextStep(id: number, dto: NextStepDto, scope: DataScope | null) {
    const program = await this.programRepo.findOne({ where: { id } });
    if (!program) throw new NotFoundException('BI Payment program not found');
    await this.assertInScope(id, scope);
    const from = program.workstep_current;
    const to = dto.targetStep;
    if (from === to) throw new BadRequestException('Program already at target step');
    if (!isValidTransition(from, to)) {
      throw new BadRequestException(`Invalid transition: ${from} → ${to}`);
    }
    program.workstep_current = to;
    await this.programRepo.save(program);
    return { id: program.id, workstep_current: to };
  }

  // Màn chuẩn bị — cập nhật các field preparing + approve checklist gộp ở đây.
  async updatePreparing(id: number, dto: Partial<UpdateBiPaymentProgramDto>, scope: DataScope | null) {
    return this.patchStepFields(id, dto, scope, BiPaymentWorkstepCurrent.PREPARING);
  }

  // Màn tính toán — cập nhật calculating_status / calculating_report_link.
  async updateCalculating(id: number, dto: Partial<UpdateBiPaymentProgramDto>, scope: DataScope | null) {
    return this.patchStepFields(id, dto, scope, BiPaymentWorkstepCurrent.CALCULATING);
  }

  // Approve report-link ở màn tính toán (calculating_status: in_review → approved).
  async approveReportLink(id: number, scope: DataScope | null) {
    return this.patchStepFields(
      id,
      { calculatingStatus: BiPaymentCalculatingStatus.APPROVED },
      scope,
      BiPaymentWorkstepCurrent.CALCULATING,
    );
  }

  // Màn tra soát — bicc full. Sale KHÔNG gọi được endpoint này (verb-gate _bicc).
  async updateReconciliationBicc(id: number, dto: Partial<UpdateBiPaymentProgramDto>, scope: DataScope | null) {
    return this.patchStepFields(id, dto, scope, BiPaymentWorkstepCurrent.RECONCILIATION);
  }

  // Màn confirm — tạo PIC confirm record (is_approval=true). Yêu cầu đang ở WAITING_FOR_APPROVAL.
  async confirm(id: number, scope: DataScope | null, userId?: number) {
    const program = await this.programRepo.findOne({ where: { id } });
    if (!program) throw new NotFoundException('BI Payment program not found');
    await this.assertInScope(id, scope);
    if (program.workstep_current !== BiPaymentWorkstepCurrent.WAITING_FOR_APPROVAL) {
      throw new BadRequestException('Program not at waiting_for_approval step');
    }
    await this.dataSource.transaction(async (manager) => {
      const pic = manager.create(BiPaymentProgramPicConfirm, {
        bi_payment_program_id: id,
        bi_payment_user_confirm_id: userId ?? null,
        is_approval: true,
        changed_at: new Date(),
      } as unknown as Partial<BiPaymentProgramPicConfirm>);
      await manager.save(pic);
    });
    return { id, confirmed: true };
  }

  // Màn release — đẩy workstep_current=release. Validate transition (phải từ WAITING_FOR_APPROVAL).
  async release(id: number, scope: DataScope | null) {
    const program = await this.programRepo.findOne({ where: { id } });
    if (!program) throw new NotFoundException('BI Payment program not found');
    await this.assertInScope(id, scope);
    if (!isValidTransition(program.workstep_current, BiPaymentWorkstepCurrent.RELEASE)) {
      throw new BadRequestException(`Invalid transition: ${program.workstep_current} → release`);
    }
    program.workstep_current = BiPaymentWorkstepCurrent.RELEASE;
    await this.programRepo.save(program);
    return { id: program.id, workstep_current: program.workstep_current };
  }

  // Private: patch subset fields + optional step guard + scope assert.
  // DTO camelCase (Strapi parity) → map entity snake_case trước Object.assign.
  private async patchStepFields(
    id: number,
    dto: Partial<UpdateBiPaymentProgramDto> | Record<string, unknown>,
    scope: DataScope | null,
    requiredStep: BiPaymentWorkstepCurrent | null,
  ) {
    const program = await this.programRepo.findOne({ where: { id } });
    if (!program) throw new NotFoundException('BI Payment program not found');
    await this.assertInScope(id, scope);
    if (requiredStep && program.workstep_current !== requiredStep) {
      throw new BadRequestException(`Program not at ${requiredStep} step`);
    }
    Object.assign(program, mapCamelToSnake(dto as Record<string, unknown>, PROGRAM_FIELD_MAPPING));
    await this.programRepo.save(program);
    return { id: program.id };
  }

  private async assertInScope(id: number, scope: DataScope | null): Promise<void> {
    if (scope === null) return;
    const qb = this.programRepo.createQueryBuilder('pg').select('1', 'one').where('pg.id = :id', { id });
    applyDataScope(qb, 'pg', PROGRAM_TABLE, scope);
    const ok = await qb.getRawOne<{ one: number }>();
    if (!ok) throw new ForbiddenException('No permission');
  }

  // PIC confirm final link (màn confirm) — ghi linkReportFinal + tạo pic_confirm row.
  // DTO camelCase (Strapi parity). Yêu cầu program đang ở WAITING_FOR_APPROVAL.
  async picConfirmFinalLink(
    id: number,
    dto: { linkReportFinal?: string; isApproval: boolean },
    scope: DataScope | null,
    userId?: number,
  ) {
    const program = await this.programRepo.findOne({ where: { id } });
    if (!program) throw new NotFoundException('BI Payment program not found');
    await this.assertInScope(id, scope);
    if (program.workstep_current !== BiPaymentWorkstepCurrent.WAITING_FOR_APPROVAL) {
      throw new BadRequestException('Program not at waiting_for_approval step');
    }
    await this.dataSource.transaction(async (manager) => {
      if (dto.linkReportFinal) program.link_report_final = dto.linkReportFinal;
      await manager.save(program);
      const pic = manager.create(BiPaymentProgramPicConfirm, {
        bi_payment_program_id: id,
        bi_payment_user_confirm_id: userId ?? null,
        is_approval: dto.isApproval,
        changed_at: new Date(),
      } as unknown as Partial<BiPaymentProgramPicConfirm>);
      await manager.save(pic);
    });
    return { id, isApproval: dto.isApproval };
  }

  // delete-many (body ids) — Strapi parity.
  async deleteMany(ids: number[], scope: DataScope | null) {
    if (!ids.length) return { success: 0, error: 0 };
    const programs = await this.programRepo.find({ where: { id: In(ids) } });
    let deletable = programs;
    if (scope !== null) {
      const inScope: BiPaymentProgram[] = [];
      for (const p of programs) {
        try {
          await this.assertInScope(p.id, scope);
          inScope.push(p);
        } catch {
          continue;
        }
      }
      deletable = inScope;
    }
    if (!deletable.length) return { success: 0, error: ids.length };
    await this.programRepo.softRemove(deletable);
    return { success: deletable.length, error: ids.length - deletable.length };
  }

  // get-newest-updated — program có updated_at gần nhất trong scope.
  async getNewestUpdated(scope: DataScope | null) {
    const qb = this.programRepo
      .createQueryBuilder('pg')
      .where('pg.deleted_at IS NULL')
      .orderBy('pg.updated_at', 'DESC')
      .limit(1);
    applyDataScope(qb, 'pg', PROGRAM_TABLE, scope);
    return qb.getOne();
  }

  // user-updated — programs updated by current user (scope vẫn applied).
  async listUserUpdated(userId: number, scope: DataScope | null) {
    const qb = this.programRepo
      .createQueryBuilder('pg')
      .where('pg.deleted_at IS NULL')
      .andWhere('pg.program_updated_by_id = :uid', { uid: userId });
    applyDataScope(qb, 'pg', PROGRAM_TABLE, scope);
    qb.orderBy('pg.updated_at', 'DESC');
    return qb.getMany();
  }
}
