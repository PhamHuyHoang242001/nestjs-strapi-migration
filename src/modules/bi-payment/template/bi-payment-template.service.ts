import { PermissionCacheService } from '@common/authorization';
import { applyDataScope } from '@modules/data-access/helpers/data-scope-applier';
import { BiPaymentTemplate } from '@modules/databases/bi-payment-template.entity';
import { WORKSTEP_TYPE_PERM } from '@modules/bi-payment/document/bi-payment-document.service';
import { MaToolWorkstepType } from '@common/enums/ma-tool.enums';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { CreateBiPaymentTemplateDto, UpdateBiPaymentTemplateDto } from './dto';
import type { DataScope } from '@common/authorization/types/data-scope.types';

const TABLE = 'bi_payment_templates';

@Injectable()
export class BiPaymentTemplateService {
  constructor(
    @InjectRepository(BiPaymentTemplate) private readonly repo: Repository<BiPaymentTemplate>,
    private readonly dataSource: DataSource,
    private readonly permissionCache: PermissionCacheService,
  ) {}

  // View template ăn theo từng step: user chỉ thấy template của step mà user có quyền.
  // workstep_type query param (optional) thu hẹp về 1 step; nếu truyền mà user ko có
  // perm step đó → 403. Record-scope vẫn qua applyDataScope (template là subtree của program).
  async search(
    scope: DataScope | null,
    userId?: number,
    workstepType?: string,
    keyword?: string,
  ) {
    const viewable = await this.resolveViewableWorksteps(userId);

    if (workstepType) {
      const wt = this.parseWorkstepType(workstepType);
      const perm = WORKSTEP_TYPE_PERM[wt];
      if (!perm || !(await this.hasStepPerm(userId, perm))) {
        throw new ForbiddenException(`No permission for workstep ${workstepType}`);
      }
      return this.queryTemplates(scope, [wt], keyword);
    }

    if (!viewable.length) return [];
    return this.queryTemplates(scope, viewable, keyword);
  }

  async details(id: number, scope: DataScope | null, userId?: number) {
    const tpl = await this.repo.createQueryBuilder('t').where('t.id = :id', { id }).getOne();
    if (!tpl) throw new NotFoundException('BI Payment template not found');
    const perm = WORKSTEP_TYPE_PERM[tpl.workstep_type];
    if (perm && !(await this.hasStepPerm(userId, perm))) {
      throw new ForbiddenException('No permission for this template workstep');
    }
    await this.assertInScope(id, scope);
    return tpl;
  }

  // create — duplicate gộp vào create (body có fromTemplateId → copy row source).
  // DTO camelCase (Strapi parity); map sang entity snake_case tại biên service.
  async create(dto: CreateBiPaymentTemplateDto, userId?: number) {
    return this.dataSource.transaction(async (manager) => {
      if (dto.fromTemplateId) {
        const src = await manager.findOne(BiPaymentTemplate, { where: { id: dto.fromTemplateId } });
        if (!src) throw new NotFoundException('Source template not found for duplicate');
        const dup = manager.create(BiPaymentTemplate, {
          ...src,
          id: undefined as never,
          created_at: undefined as never,
          updated_at: undefined as never,
          name: dto.name,
          bi_payment_program_id: dto.programId,
          workstep_type: dto.workstepType,
          template_created_by_id: userId ?? null,
          template_updated_by_id: userId ?? null,
        } as unknown as Partial<BiPaymentTemplate>);
        const saved = await manager.save(dup);
        return { id: saved.id };
      }
      const entity = manager.create(BiPaymentTemplate, {
        name: dto.name,
        description: dto.description,
        upload_method: dto.uploadMethod,
        bi_payment_program_id: dto.programId,
        workstep_type: dto.workstepType,
        template_type: dto.templateType,
        template_status: dto.status,
        template_created_by_id: userId ?? null,
      } as unknown as Partial<BiPaymentTemplate>);
      const saved = await manager.save(entity);
      return { id: saved.id };
    });
  }

  async update(id: number, dto: UpdateBiPaymentTemplateDto, userId?: number) {
    const tpl = await this.repo.findOne({ where: { id } });
    if (!tpl) throw new NotFoundException('BI Payment template not found');
    Object.assign(tpl, dto, { template_updated_by_id: userId ?? tpl.template_updated_by_id });
    await this.repo.save(tpl);
    return { id: tpl.id };
  }

  async delete(id: number) {
    const tpl = await this.repo.findOne({ where: { id } });
    if (!tpl) throw new NotFoundException('BI Payment template not found');
    await this.repo.softRemove(tpl);
    return { id: tpl.id };
  }

  // delete-many via query ?ids=1,2,3 — soft-delete batch (Strapi parity).
  async deleteMany(rawIds: string) {
    const ids = rawIds
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n > 0);
    if (!ids.length) return { success: 0, error: 0 };
    const tpls = await this.repo.find({ where: { id: In(ids) } });
    if (!tpls.length) return { success: 0, error: ids.length };
    await this.repo.softRemove(tpls);
    return { success: tpls.length, error: ids.length - tpls.length };
  }

  // duplicate-many — batch copy nhiều template source sang template mới (cùng workstep_type).
  async duplicateMany(templateIds: number[], userId?: number) {
    if (!templateIds.length) return { success: 0, error: 0 };
    const sources = await this.repo.find({ where: { id: In(templateIds) } });
    const found = sources.length;
    const rows = sources.map((src) =>
      this.repo.create({
        ...src,
        id: undefined as never,
        created_at: undefined as never,
        updated_at: undefined as never,
        name: `${src.name ?? 'template'} (copy)`,
        template_created_by_id: userId ?? null,
        template_updated_by_id: userId ?? null,
      } as unknown as Partial<BiPaymentTemplate>),
    );
    if (!rows.length) return { success: 0, error: templateIds.length };
    const saved = await this.repo.save(rows);
    return { success: saved.length, error: templateIds.length - found };
  }

  // user-created/user-updated — templates by user (scope applied via workstep filter).
  async listUserCreated(userId: number, scope: DataScope | null) {
    return this.userScopedTemplates('t.template_created_by_id = :uid', userId, scope);
  }

  async listUserUpdated(userId: number, scope: DataScope | null) {
    return this.userScopedTemplates('t.template_updated_by_id = :uid', userId, scope);
  }

  private async userScopedTemplates(where: string, userId: number, scope: DataScope | null) {
    const qb = this.repo
      .createQueryBuilder('t')
      .where('t.deleted_at IS NULL')
      .andWhere(where, { uid: userId });
    applyDataScope(qb, 't', TABLE, scope);
    qb.orderBy('t.created_at', 'DESC');
    return qb.getMany();
  }

  // download — return template metadata (file streaming deferred to media pipeline).
  async download(id: number, scope: DataScope | null, userId?: number) {
    const tpl = await this.repo.createQueryBuilder('t').where('t.id = :id', { id }).getOne();
    if (!tpl) throw new NotFoundException('BI Payment template not found');
    const perm = WORKSTEP_TYPE_PERM[tpl.workstep_type];
    if (perm && !(await this.hasStepPerm(userId, perm))) {
      throw new ForbiddenException('No permission for this template workstep');
    }
    await this.assertInScope(id, scope);
    return tpl;
  }

  private async assertInScope(id: number, scope: DataScope | null): Promise<void> {
    if (scope === null) return;
    const qb = this.repo.createQueryBuilder('t').select('1', 'one').where('t.id = :id', { id });
    applyDataScope(qb, 't', TABLE, scope);
    const ok = await qb.getRawOne();
    if (!ok) throw new ForbiddenException('No permission');
  }

  // Shared query: filter template theo tập workstep_type user được xem + record-scope.
  private async queryTemplates(
    scope: DataScope | null,
    worksteps: MaToolWorkstepType[],
    keyword?: string,
  ) {
    const qb = this.repo
      .createQueryBuilder('t')
      .where('t.deleted_at IS NULL')
      .andWhere('t.workstep_type IN (:...wts)', { wts: worksteps });
    applyDataScope(qb, 't', TABLE, scope);
    if (keyword) qb.andWhere('t.name ILIKE :kw', { kw: `%${keyword.trim()}%` });
    qb.orderBy('t.created_at', 'DESC');
    return qb.getMany();
  }

  // Tập workstep_type mà user có quyền step tương ứng.
  private async resolveViewableWorksteps(userId?: number): Promise<MaToolWorkstepType[]> {
    if (!userId) return [];
    const perms = await this.permissionCache.getPermissions(userId);
    return (Object.keys(WORKSTEP_TYPE_PERM) as MaToolWorkstepType[]).filter((wt) =>
      perms.has(WORKSTEP_TYPE_PERM[wt]),
    );
  }

  private async hasStepPerm(userId?: number, code?: string): Promise<boolean> {
    if (!userId || !code) return false;
    return this.permissionCache.hasPermission(userId, code);
  }

  private parseWorkstepType(value?: string): MaToolWorkstepType {
    if (!value || !Object.values(MaToolWorkstepType).includes(value as MaToolWorkstepType)) {
      throw new ForbiddenException(`Invalid workstep_type: ${value ?? ''}`);
    }
    return value as MaToolWorkstepType;
  }
}
