import { BiPaymentTemplate } from '@modules/databases/bi-payment-template.entity';
import { BiPaymentProgram } from '@modules/databases/bi-payment-program.entity';
import { BiPaymentProject } from '@modules/databases/bi-payment-project.entity';
import { BiPaymentProjectStatus } from '@common/enums/bi-payment.enums';
import { StepScopeService } from '@modules/bi-payment/common/step-scope.service';
import { ALL_WORKSTEP_TYPES } from '@modules/bi-payment/common/step-scope.constants';
import { MaToolWorkstepType, MaToolTemplateStatus, MaToolTemplateType } from '@common/enums/ma-tool.enums';
import { PaginationParams } from '@common/decorators/pagination.decorator';
import { execQueryPaignation } from '@common/utils';
import { PermissionCacheService } from '@common/authorization';
import { SortCamelParams } from '../common/decorators/sort-camel.decorator';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository, SelectQueryBuilder } from 'typeorm';
import {
  CreateBiPaymentTemplateDto,
  DuplicateManyTemplateDto,
  SearchBiPaymentTemplateDto,
  UpdateBiPaymentTemplateDto,
} from './dto';

// Admin signal — super_admin bypasses the step×program check (mirrors
// PermissionGuard's super-admin verb-gate bypass). Read from req.info.user.type.
type AdminFlag = { isAdmin: boolean };

const PROGRAM_TABLE = 'bi_payment_programs';
const CREATE_CODE = 'bp_template_create';
const DELETE_CODE = 'bp_template_delete';
const UPLOAD_CODE = 'bp_program_upload';
const RECON_UPLOAD_CODE = 'bp_program_upload_recon';

// workstep_type values allowed per program.version (Strapi validationCreateTemplate).
// version 0 admits ex_prepare; later versions drop it.
const V0_WORKSTEPS = [
  MaToolWorkstepType.EX_PREPARE,
  MaToolWorkstepType.PREPARE,
  MaToolWorkstepType.RECON_DATA,
  MaToolWorkstepType.RECON_FEEDBACK,
];
const NON_V0_WORKSTEPS = [MaToolWorkstepType.PREPARE, MaToolWorkstepType.RECON_DATA, MaToolWorkstepType.RECON_FEEDBACK];

@Injectable()
export class BiPaymentTemplateService {
  constructor(
    @InjectRepository(BiPaymentTemplate) private readonly repo: Repository<BiPaymentTemplate>,
    @InjectRepository(BiPaymentProgram) private readonly programRepo: Repository<BiPaymentProgram>,
    @InjectRepository(BiPaymentProject) private readonly projectRepo: Repository<BiPaymentProject>,
    private readonly dataSource: DataSource,
    private readonly stepScope: StepScopeService,
    private readonly permCache: PermissionCacheService,
  ) {}

  // Strapi parity (findTemplateV2): list templates of a program the caller has
  // step-scope at, with IFindTemplate filters + sort + pagination. visibility =
  // step×program (SO own-all). programId required. Returns {data, meta}.
  async search(
    userId: number | undefined,
    dto: SearchBiPaymentTemplateDto,
    sortParams: SortCamelParams,
    pagination: PaginationParams,
  ) {
    if (!userId) throw new ForbiddenException('User not authenticated');
    if (!dto.programId || !Number.isFinite(dto.programId) || dto.programId <= 0) {
      throw new BadRequestException('programId required');
    }

    // bp_template_create mở full-view mọi workstep trong program: người tạo
    // template cần thấy toàn bộ template của program để duplicate. Nó độc lập
    // với content-view map (WORKSTEP_VIEW_CODES), nên check riêng trước khi fall
    // back về step-scope thông thường.
    const hasCreateCap = await this.stepScope.hasProgramCapability(userId, dto.programId, CREATE_CODE);
    let worksteps: MaToolWorkstepType[] | null = null;
    if (hasCreateCap) {
      worksteps = this.intersectWorksteps(dto.workstepType, new Set(ALL_WORKSTEP_TYPES));
    } else {
      const scopes = await this.stepScope.resolveWorkstepScopesOrEmpty(userId, dto.programId);
      if (scopes.size === 0) {
        return { data: [], meta: { total: 0, page: pagination.page, limit: pagination.limit } };
      }
      worksteps = this.intersectWorksteps(dto.workstepType, new Set(scopes.keys()));
    }

    const qb = this.repo
      .createQueryBuilder('t')
      .innerJoin('t.program', 'pg', 'pg.deleted_at IS NULL')
      .leftJoin('t.documents', 'd', 'd.deleted_at IS NULL AND d.document_status != :draft', {
        draft: 'draft',
      })
      .where('t.deleted_at IS NULL')
      .andWhere('t.template_type = :type', { type: MaToolTemplateType.BI_PAYMENT })
      .andWhere('t.bi_payment_program_id = :pid', { pid: dto.programId })
      .andWhere('t.workstep_type IN (:...wts)', { wts: worksteps });

    this.applySearchFilters(qb, dto);
    qb.orderBy(`t.${sortParams.sort_field}`, sortParams.sort_order as 'ASC' | 'DESC');
    return execQueryPaignation(qb, pagination.page, pagination.limit);
  }

  // Strapi parity (findOneTemplateById): single template + flags.
  // is_uploader: true (Strapi sets true). canDuplicate: caller holds the create
  // step-code at the template's program (proxy for bicc-of-program — R5 deviation).
  async details(id: number, userId: number | undefined, admin: AdminFlag) {
    const tpl = await this.loadTemplateWithRelations(id);
    await this.assertTemplateStep(userId, tpl, admin);
    const programId = tpl.bi_payment_program_id;
    const canDuplicate = await this.canDuplicateAt(userId, programId, admin);
    return { ...tpl, is_uploader: true, canDuplicate };
  }

  // Strapi parity (downloadFileFormatTemplateBiPayment): excel stream. NestJS
  // has no excelJS/S3 pipeline → metadata-only (TODO). Step-scope enforced.
  async download(id: number, userId: number | undefined, admin: AdminFlag) {
    const tpl = await this.loadTemplateWithRelations(id);
    await this.assertTemplateStep(userId, tpl, admin);
    return tpl;
  }

  // Strapi parity (createTemplate): validate + insert. sheets cascade omitted
  // (no sheet entity → TODO). Validation: name-safe, dup-check, program/project
  // active, workstep-vs-version. Permission: step-scope at program (assertWorkstep).
  async create(dto: CreateBiPaymentTemplateDto, userId?: number) {
    if (!userId) throw new ForbiddenException('User not authenticated');
    const program = await this.validateCreateTemplate(dto, userId);
    const entity = this.repo.create({
      name: dto.name,
      description: dto.description,
      upload_method: dto.uploadMethod,
      bi_payment_program_id: dto.programId,
      workstep_type: dto.workstepType,
      template_type: dto.templateType ?? MaToolTemplateType.BI_PAYMENT,
      template_status: dto.status ?? MaToolTemplateStatus.SUBMIT,
      version: program.version,
      template_created_by_id: userId,
      template_updated_by_id: userId,
    } as unknown as Partial<BiPaymentTemplate>);
    const saved = await this.repo.save(entity);
    // TODO: saveManySheetTemplate(dto.sheets) cascade when sheet entity exists.
    return { id: saved.id, name: saved.name };
  }

  async update(id: number, dto: UpdateBiPaymentTemplateDto, userId?: number) {
    const tpl = await this.repo.findOne({ where: { id } });
    if (!tpl) throw new NotFoundException('BI Payment template not found');
    Object.assign(tpl, dto, { template_updated_by_id: userId ?? tpl.template_updated_by_id });
    await this.repo.save(tpl);
    return { id: tpl.id };
  }

  // Strapi parity (deleteTemplate): block if template has non-draft documents;
  // require project ACTIVE; step-scope at program. Soft-delete.
  async delete(id: number, userId: number | undefined, admin: AdminFlag) {
    const tpl = await this.loadTemplateWithRelations(id);
    await this.assertTemplateLifecycleScope(userId, tpl.bi_payment_program_id, DELETE_CODE, admin);
    if (tpl.bi_payment_program?.project?.project_status !== BiPaymentProjectStatus.ACTIVE) {
      throw new BadRequestException('Project not active');
    }
    const linkedDocs = (tpl.documents ?? []).filter((d) => d.document_status !== 'draft');
    if (linkedDocs.length > 0) {
      throw new BadRequestException('exists a link to the document');
    }
    // softRemove sets deleted_at (the column every read path filters on).
    // Setting is_deleted alone leaves deleted_at null → row stays visible.
    tpl.template_updated_by_id = userId ?? tpl.template_updated_by_id;
    await this.repo.save(tpl);
    await this.repo.softRemove(tpl);
    return { id: tpl.id };
  }

  // Strapi parity (deleteManyTemplate): ?ids=csv → soft-delete batch, skip
  // templates with linked documents, scope by caller's accessible programs.
  // Wrapped in a transaction so a mid-loop failure rolls back all soft-deletes.
  async deleteMany(rawIds: string, userId: number | undefined, admin: AdminFlag) {
    const ids = this.parseIdsCsv(rawIds);
    if (!ids.length) return { success: 0, error: 0 };
    const tpls = await this.repo.find({
      where: { id: In(ids), template_type: MaToolTemplateType.BI_PAYMENT },
      relations: ['documents', 'program', 'program.project'],
    });
    const deletable: BiPaymentTemplate[] = [];
    for (const tpl of tpls) {
      const linkedDocs = (tpl.documents ?? []).filter((d) => d.document_status !== 'draft');
      if (linkedDocs.length > 0) continue; // skip linked
      const ok = admin.isAdmin || (await this.hasProgramCapability(userId, tpl.bi_payment_program_id, DELETE_CODE));
      if (!ok) continue;
      tpl.template_updated_by_id = userId ?? tpl.template_updated_by_id;
      deletable.push(tpl);
    }
    if (deletable.length) {
      await this.dataSource.transaction(async (manager) => {
        await manager.getRepository(BiPaymentTemplate).save(deletable);
        await manager.getRepository(BiPaymentTemplate).softRemove(deletable);
      });
    }
    return { success: deletable.length, error: ids.length - deletable.length };
  }

  // Strapi parity (duplicateManyTemplate): {fromProgramId, fromProjectId,
  // toProgramId, listTemplate:[{id,name}]}. Validate names unique (batch +
  // existing), sources exist in fromProgram, toProgram active. Each duplicated
  // template keeps source workstep_type, new name, target program + version.
  // No sheet cascade (TODO).
  async duplicateMany(dto: DuplicateManyTemplateDto, userId?: number) {
    if (!userId) throw new ForbiddenException('User not authenticated');
    const { fromProgramId, toProgramId, listTemplate } = dto;
    if (!listTemplate?.length) throw new BadRequestException('listTemplate required');

    const names = listTemplate.map((t) => t.name?.trim()).filter(Boolean);
    if (new Set(names).size !== names.length) {
      throw new BadRequestException('templateName duplicated');
    }

    const [toProgram, existingNames, sources] = await Promise.all([
      this.programRepo.findOne({
        where: { id: toProgramId, is_deleted: false },
      }),
      this.repo.find({
        where: {
          name: In(names),
          is_deleted: false,
          template_type: MaToolTemplateType.BI_PAYMENT,
        },
        select: ['id', 'name'],
      }),
      this.repo.find({
        where: {
          id: In(listTemplate.map((t) => t.id)),
          is_deleted: false,
          template_type: MaToolTemplateType.BI_PAYMENT,
          bi_payment_program_id: fromProgramId,
        },
      }),
    ]);

    if (!toProgram || toProgram.is_deleted) {
      throw new NotFoundException('Target program not found');
    }
    await Promise.all([
      this.assertProgramCapability(userId, fromProgramId, CREATE_CODE),
      this.assertProgramCapability(userId, toProgramId, CREATE_CODE),
    ]);
    if (existingNames.length > 0) {
      throw new BadRequestException('templateName exists');
    }
    if (sources.length !== listTemplate.length) {
      throw new NotFoundException('Some templates not found in source program');
    }

    const nameById = new Map(listTemplate.map((t) => [t.id, t.name.trim()]));
    const saved = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(BiPaymentTemplate);
      const rows = sources.map((src) =>
        repo.create({
          name: nameById.get(src.id) ?? src.name,
          description: src.description,
          upload_method: src.upload_method,
          bi_payment_program_id: toProgramId,
          workstep_type: src.workstep_type,
          template_type: MaToolTemplateType.BI_PAYMENT,
          template_status: MaToolTemplateStatus.SUBMIT,
          version: toProgram.version,
          template_created_by_id: userId,
          template_updated_by_id: userId,
        } as unknown as Partial<BiPaymentTemplate>),
      );
      return repo.save(rows);
    });
    // TODO: duplicate sheet_templates cascade when sheet entity exists.
    return { template_duplicate: saved.map((t) => ({ id: t.id, name: t.name })) };
  }

  // Strapi parity (findUserCreatedTemplate / findUserUpdatedTemplate): distinct
  // USERS (id+email) who created/updated bi-payment templates the caller may
  // see, scoped to programs where they hold any step code. keyword→email ILIKE.
  async listUserCreated(keyword: string | undefined, pagination: PaginationParams, userId: number, admin: AdminFlag) {
    return this.distinctUsersByColumn('t.template_created_by_id', keyword, pagination, userId, admin);
  }

  async listUserUpdated(keyword: string | undefined, pagination: PaginationParams, userId: number, admin: AdminFlag) {
    return this.distinctUsersByColumn('t.template_updated_by_id', keyword, pagination, userId, admin);
  }

  // ---- helpers ----

  // Apply IFindTemplate optional filters (project/version/createdBy/updatedBy/keyword).
  private applySearchFilters(qb: SelectQueryBuilder<BiPaymentTemplate>, dto: SearchBiPaymentTemplateDto) {
    if (dto.projectId) {
      qb.andWhere('pg.project_id = :pjid', { pjid: dto.projectId });
    }
    if (dto.version !== undefined) {
      qb.andWhere('t.version = :ver', { ver: dto.version });
    }
    if (dto.createdByIds) {
      const ids = this.parseIdsCsv(dto.createdByIds);
      if (ids.length) qb.andWhere('t.template_created_by_id IN (:...cbids)', { cbids: ids });
    }
    if (dto.updatedByIds) {
      const ids = this.parseIdsCsv(dto.updatedByIds);
      if (ids.length) qb.andWhere('t.template_updated_by_id IN (:...ubids)', { ubids: ids });
    }
    if (dto.keyword?.trim()) {
      qb.andWhere('(t.name ILIKE :kw OR t.description ILIKE :kw)', { kw: `%${dto.keyword.trim()}%` });
    }
  }

  // Intersect the requested workstepType (single or csv) with the caller's
  // allowed set. Invalid enum value → 400 (parity with document parseWorkstepType);
  // valid-but-not-allowed → 403 (client learns the step×program contract).
  private intersectWorksteps(raw: string | undefined, allowed: Set<MaToolWorkstepType>): MaToolWorkstepType[] {
    if (!raw?.trim()) return [...allowed];
    const requested = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const enumVals = Object.values(MaToolWorkstepType);
    const invalid = requested.filter((w) => !enumVals.includes(w as MaToolWorkstepType));
    if (invalid.length) {
      throw new BadRequestException(`Invalid workstepType: ${invalid.join(',')}`);
    }
    const valid = requested as MaToolWorkstepType[];
    const denied = valid.filter((w) => !allowed.has(w));
    if (denied.length) throw new ForbiddenException(`No permission for workstep ${denied.join(',')}`);
    return valid;
  }

  // Validate create body (Strapi validationCreateTemplate, minus sheets).
  private async validateCreateTemplate(dto: CreateBiPaymentTemplateDto, userId: number) {
    if (!dto.name || !dto.name.trim()) throw new BadRequestException('name required');
    if (!dto.uploadMethod) throw new BadRequestException('uploadMethod required');
    if (!dto.projectId) throw new BadRequestException('projectId required');
    if (!dto.programId) throw new BadRequestException('programId required');

    const [dupName, program, project] = await Promise.all([
      this.repo.findOne({
        where: { name: dto.name, is_deleted: false, template_type: MaToolTemplateType.BI_PAYMENT },
        select: ['id'],
      }),
      this.programRepo.findOne({
        where: { id: dto.programId, is_deleted: false },
      }),
      this.projectRepo.findOne({ where: { id: dto.projectId, is_deleted: false } }),
    ]);
    if (dupName) throw new BadRequestException('template name exists');
    if (!program) throw new NotFoundException('Program not found');
    if (!project) throw new NotFoundException('Project not found');
    if (project.project_status !== BiPaymentProjectStatus.ACTIVE) {
      throw new BadRequestException('Project inactive');
    }

    // workstep-vs-version rule (Strapi).
    const allowedWs = (program as unknown as { version?: number }).version === 0 ? V0_WORKSTEPS : NON_V0_WORKSTEPS;
    if (!allowedWs.includes(dto.workstepType)) {
      throw new BadRequestException('Invalid workstepType for program version');
    }

    // Template lifecycle uses its own verb + program data access. It must not
    // silently require an upload/view permission for the selected workstep.
    await this.assertProgramCapability(userId, dto.programId, CREATE_CODE);
    return program;
  }

  // canDuplicate: caller holds the create step-code at the template's program
  // (proxy for Strapi's bicc-of-program + project-active). R5 deviation.
  private async canDuplicateAt(
    userId: number | undefined,
    programId: number | null,
    admin: AdminFlag,
  ): Promise<boolean> {
    if (admin.isAdmin) return true;
    if (!userId || !programId) return false;
    const ids = await this.permCache.getAccessibleRecords(userId, PROGRAM_TABLE, CREATE_CODE);
    return ids.includes(programId);
  }

  // Load template + program→project (status) + non-draft documents (link check).
  private async loadTemplateWithRelations(id: number): Promise<BiPaymentTemplate> {
    const tpl = await this.repo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.program', 'pg')
      .leftJoinAndSelect('pg.project', 'pj')
      .leftJoinAndSelect('t.documents', 'd', 'd.deleted_at IS NULL AND d.document_status != :draft', {
        draft: 'draft',
      })
      .where('t.id = :id', { id })
      .andWhere('t.deleted_at IS NULL')
      .getOne();
    if (!tpl) throw new NotFoundException('BI Payment template not found');
    return tpl;
  }

  // Step-scoped assert for a single template. Admin bypasses.
  // bp_template_create cũng mở view: ai có create-code ở program xem được
  // template bất kể workstep (đồng bộ với list). Phục vụ luồng duplicate
  // (người tạo template cần xem chi tiết template nguồn).
  private async assertTemplateStep(
    userId: number | undefined,
    tpl: BiPaymentTemplate,
    admin: AdminFlag,
  ): Promise<void> {
    if (admin.isAdmin) return;
    if (!userId) throw new ForbiddenException('User not authenticated');
    const programId = tpl.bi_payment_program_id;
    if (!programId) throw new ForbiddenException('No permission');
    if (await this.stepScope.hasProgramCapability(userId, programId, CREATE_CODE)) return;
    const allowed = await this.stepScope.resolveAllowedWorksteps(userId, programId);
    if (!allowed.has(tpl.workstep_type)) throw new ForbiddenException('No permission for workstep');
  }

  private async assertTemplateLifecycleScope(
    userId: number | undefined,
    programId: number | null,
    code: string,
    admin: AdminFlag,
  ): Promise<void> {
    if (admin.isAdmin) return;
    if (!userId || !programId || !(await this.stepScope.hasProgramCapability(userId, programId, code))) {
      throw new ForbiddenException('No permission for program');
    }
  }

  private async assertProgramCapability(userId: number, programId: number, code: string): Promise<void> {
    if (!(await this.stepScope.hasProgramCapability(userId, programId, code))) {
      throw new ForbiddenException('No permission for program');
    }
  }

  private async hasProgramCapability(userId: number | undefined, programId: number | null, code: string) {
    return Boolean(userId && programId && (await this.stepScope.hasProgramCapability(userId, programId, code)));
  }

  // Distinct users (id + email) who touched templates (via `userCol`) within
  // programs the caller holds any step code at. Mirrors document user-*.
  private async distinctUsersByColumn(
    userCol: string,
    keyword: string | undefined,
    pagination: PaginationParams,
    userId: number,
    admin: AdminFlag,
  ) {
    if (!userId) throw new ForbiddenException('User not authenticated');
    // Shared predicate builder so the page query and the count query stay in sync.
    const applyScope = (qb: SelectQueryBuilder<BiPaymentTemplate>) => {
      qb.innerJoin('users', 'u', `u.id = ${userCol} AND u.deleted_at IS NULL`)
        .where('t.deleted_at IS NULL')
        .andWhere('t.template_type = :type', { type: MaToolTemplateType.BI_PAYMENT })
        .andWhere(`${userCol} IS NOT NULL`);
    };

    let uploadPrograms: number[] = [];
    let reconPrograms: number[] = [];
    if (!admin.isAdmin) {
      [uploadPrograms, reconPrograms] = await Promise.all([
        this.getAccessibleProgramIds(userId, UPLOAD_CODE),
        this.getAccessibleProgramIds(userId, RECON_UPLOAD_CODE),
      ]);
      if (!uploadPrograms.length && !reconPrograms.length) {
        return { data: [], meta: { total: 0, page: pagination.page, limit: pagination.limit } };
      }
    }
    const kw = keyword?.trim() ? `%${keyword.trim().toLowerCase()}%` : undefined;

    // Count query: COUNT(DISTINCT userCol) over the same joins/filters (no paging).
    const countQb = this.repo.createQueryBuilder('t').select(`COUNT(DISTINCT ${userCol})`, 'count');
    applyScope(countQb);
    if (!admin.isAdmin) this.applyCrossProgramScope(countQb, uploadPrograms, reconPrograms);
    if (kw) countQb.andWhere('LOWER(u.email) ILIKE :kw', { kw });
    const totalRow = await countQb.getRawOne<{ count: string }>();
    const total = totalRow ? Number(totalRow.count) : 0;

    // Page query: DISTINCT userCol + email, ordered + paged.
    // .distinct(true) emits `SELECT DISTINCT` correctly; putting DISTINCT inside .select()
    // yields `SELECT u.email, DISTINCT t.col` (DISTINCT mid-list) which is invalid SQL.
    const qb = this.repo.createQueryBuilder('t').distinct(true).select(userCol, 'id').addSelect('u.email', 'email');
    applyScope(qb);
    if (!admin.isAdmin) this.applyCrossProgramScope(qb, uploadPrograms, reconPrograms);
    if (kw) qb.andWhere('LOWER(u.email) ILIKE :kw', { kw });
    // Raw DISTINCT select paginates with offset/limit; skip/take triggers TypeORM's
    // distinct-alias subquery wrapper which collides with the explicit DISTINCT (SQL syntax error).
    // Order by the selected user column (= u.id via the join): SELECT DISTINCT requires every
    // ORDER BY expression to appear in the select list.
    qb.orderBy(userCol, 'DESC')
      .offset((pagination.page - 1) * pagination.limit)
      .limit(pagination.limit);
    const rows = await qb.getRawMany<{ id: number; email: string }>();
    const data = rows.map((r) => ({ id: Number(r.id), email: r.email }));
    return { data, meta: { total, page: pagination.page, limit: pagination.limit } };
  }

  private applyCrossProgramScope(
    qb: SelectQueryBuilder<BiPaymentTemplate>,
    uploadPrograms: number[],
    reconPrograms: number[],
  ) {
    const clauses: string[] = [];
    const params: Record<string, unknown> = {};
    if (uploadPrograms.length) {
      clauses.push('t.bi_payment_program_id IN (:...crossUploadPrograms)');
      params.crossUploadPrograms = uploadPrograms;
    }
    if (reconPrograms.length) {
      clauses.push('(t.bi_payment_program_id IN (:...crossReconPrograms) AND t.workstep_type = :crossReconWorkstep)');
      params.crossReconPrograms = reconPrograms;
      params.crossReconWorkstep = MaToolWorkstepType.RECON_DATA;
    }
    qb.andWhere(`(${clauses.join(' OR ')})`, params);
  }

  private async getAccessibleProgramIds(userId: number, code: string): Promise<number[]> {
    return this.permCache.getAccessibleRecords(userId, PROGRAM_TABLE, code);
  }

  private parseIdsCsv(raw: string | undefined): number[] {
    return (raw ?? '')
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n > 0);
  }
}
