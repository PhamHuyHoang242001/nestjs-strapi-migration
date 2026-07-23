import { applyDataScope } from '@modules/data-access/helpers/data-scope-applier';
import { BiPaymentDocument } from '@modules/databases/bi-payment-document.entity';
import { BiPaymentTemplate } from '@modules/databases/bi-payment-template.entity';
import { BiPaymentLogMergeFile } from '@modules/databases/bi-payment-log-merge-file.entity';
import { BiPaymentProgram } from '@modules/databases/bi-payment-program.entity';
import { MaToolWorkstepType } from '@common/enums/ma-tool.enums';
import {
  BiPaymentLogMergeFileStatus,
  BiPaymentLogMergeFileMode,
  BiPaymentProgressStatus,
} from '@common/enums/bi-payment.enums';
import { PaginationParams } from '@common/decorators/pagination.decorator';
import { execQueryPaignation } from '@common/utils';
import { PermissionCacheService } from '@common/authorization';
import { SortCamelParams } from '../common/decorators/sort-camel.decorator';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { SearchBiPaymentDocumentDto, UploadBiPaymentDocumentDto } from './dto';
import { StepScopeService, WorkstepScope } from '../common/step-scope.service';
import type { DataScope } from '@common/authorization/types/data-scope.types';

const PROGRAM_TABLE = 'bi_payment_programs';
const UPLOAD_CODE = 'bp_program_upload';
const RECON_UPLOAD_CODE = 'bp_program_upload_recon';
const APPROVE_CODE = 'bp_program_approve';

// Admin signal — super_admin bypasses the step×program check (mirrors PermissionGuard).
// Passed explicitly from the controller (read from req.info.user.type) instead of inferring
// from a null DataScope, because single-record endpoints have no @RequireDataAccess and a null
// scope would otherwise mean "every non-admin" → admin bypass for everyone (the template bug).
type AdminFlag = { isAdmin: boolean };
type CapabilityCheck = (programId: number, code: string) => Promise<boolean>;

@Injectable()
export class BiPaymentDocumentService {
  constructor(
    @InjectRepository(BiPaymentDocument)
    private readonly docRepo: Repository<BiPaymentDocument>,
    @InjectRepository(BiPaymentTemplate)
    private readonly templateRepo: Repository<BiPaymentTemplate>,
    @InjectRepository(BiPaymentLogMergeFile)
    private readonly mergeRepo: Repository<BiPaymentLogMergeFile>,
    @InjectRepository(BiPaymentProgram)
    private readonly programRepo: Repository<BiPaymentProgram>,
    private readonly stepScope: StepScopeService,
    private readonly permCache: PermissionCacheService,
  ) {}

  // List documents for a program, scoped by step permission.
  // `programId` is required — the call is rejected without it. StepScopeService
  // resolves which workstep_type values the user may view at this program (SO
  // owner = all; otherwise only worksteps whose mapped code the user holds via a
  // program-scoped data_access rule). `workstep` (optional) narrows to one step;
  // if supplied it must be within the allowed set, else 403.
  // No per-record data-scope: visibility = step×program (a user holding a step
  // code at this program sees every doc of that step).
  async list(
    programId: number | undefined,
    query: SearchBiPaymentDocumentDto,
    userId: number | undefined,
    sortParams: SortCamelParams,
    pagination: PaginationParams,
  ) {
    if (!programId || !Number.isFinite(programId) || programId <= 0) {
      throw new BadRequestException('programId required');
    }
    if (!userId) throw new ForbiddenException('User not authenticated');

    const workstep = this.parseWorkstepType(query.workstep);
    const scopes = await this.stepScope.resolveWorkstepScopesOrEmpty(userId, programId);

    // `bp_program_view` is the base gate but does not grant document content.
    // Preserve the agreed empty-200 contract instead of throwing a 403.
    if (scopes.size === 0) return { data: [], total: 0 };

    if (workstep && !scopes.has(workstep)) {
      throw new ForbiddenException('No permission for workstep');
    }

    const qb = this.buildDocQuery();
    this.applyProgramFilter(qb, programId);
    this.applyWorkstepFilter(qb, workstep, scopes, userId);
    this.applyListFilters(qb, query);

    // Sort on the document table (Strapi's phase-2 sorts document attributes only).
    qb.orderBy(`d.${sortParams.sort_field}`, sortParams.sort_order as 'ASC' | 'DESC');
    return execQueryPaignation(qb, pagination.page, pagination.limit);
  }

  // Shared query base: document joined to template + program, soft-delete filtered.
  // template join drives workstep_type filter; program join drives workstep_current filter.
  private buildDocQuery() {
    return this.docRepo
      .createQueryBuilder('d')
      .innerJoin('d.template', 't', 't.deleted_at IS NULL')
      .innerJoinAndSelect('d.program', 'pg', 'pg.deleted_at IS NULL')
      .where('d.deleted_at IS NULL');
  }

  private applyProgramFilter(qb: ReturnType<BiPaymentDocumentService['buildDocQuery']>, programId: number) {
    qb.andWhere('d.program_id = :pid', { pid: programId });
  }

  // workstep: a single step narrows to it; otherwise the caller's allowed step set.
  private applyWorkstepFilter(
    qb: ReturnType<BiPaymentDocumentService['buildDocQuery']>,
    workstep: MaToolWorkstepType | undefined,
    scopes: Map<MaToolWorkstepType, WorkstepScope>,
    userId: number,
  ) {
    if (workstep) {
      qb.andWhere('t.workstep_type = :wt', { wt: workstep });
      if (scopes.get(workstep)?.own) {
        qb.andWhere('d.uploaded_by_id = :scopeUserId', { scopeUserId: userId });
      }
      return;
    }

    const fullWorksteps: MaToolWorkstepType[] = [];
    const ownWorksteps: MaToolWorkstepType[] = [];
    for (const [type, scope] of scopes) {
      (scope.own ? ownWorksteps : fullWorksteps).push(type);
    }

    if (fullWorksteps.length && ownWorksteps.length) {
      qb.andWhere(
        '(t.workstep_type IN (:...fullWorksteps) OR (t.workstep_type IN (:...ownWorksteps) AND d.uploaded_by_id = :scopeUserId))',
        { fullWorksteps, ownWorksteps, scopeUserId: userId },
      );
    } else if (fullWorksteps.length) {
      qb.andWhere('t.workstep_type IN (:...fullWorksteps)', { fullWorksteps });
    } else {
      qb.andWhere('t.workstep_type IN (:...ownWorksteps) AND d.uploaded_by_id = :scopeUserId', {
        ownWorksteps,
        scopeUserId: userId,
      });
    }
  }

  // Strapi-parity (IFindDocument) filter set applied AFTER the base query + program/workstep.
  // Used by both list and stats. workstepCurrent → program.workstep_current (NOT doc status).
  private applyListFilters(
    qb: ReturnType<BiPaymentDocumentService['buildDocQuery']>,
    query: SearchBiPaymentDocumentDto,
  ) {
    if (query.templateIds) {
      const tids = query.templateIds
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => n > 0);
      if (tids.length) qb.andWhere('d.template_id IN (:...tids)', { tids });
    }
    if (query.checklistIds && query.checklistIds.toLowerCase() !== 'all') {
      const cids = query.checklistIds
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => n > 0);
      if (cids.length) qb.andWhere('d.bi_payment_checklist_id IN (:...cids)', { cids });
    }
    if (query.projectId) {
      const pjid = Number(query.projectId);
      if (pjid > 0) qb.andWhere('pg.project_id = :pjid', { pjid });
    }
    if (query.status) qb.andWhere('d.document_status = :st', { st: query.status });
    // keyword: free-text over document_name + notes (Strapi parity: doc.name OR doc.description).
    if (query.keyword?.trim()) {
      qb.andWhere('(d.document_name ILIKE :kw OR d.notes ILIKE :kw)', { kw: `%${query.keyword.trim()}%` });
    }
    // workstepCurrent filters the PROGRAM's current workstep, not the document status.
    if (query.workstepCurrent) qb.andWhere('pg.workstep_current = :wsc', { wsc: query.workstepCurrent });
    if (query.s3UploadStatus) qb.andWhere('d.s3_upload_status = :s3', { s3: query.s3UploadStatus });
    if (query.uploadMethod) qb.andWhere('t.upload_method = :um', { um: query.uploadMethod });
    if (query.version) qb.andWhere('t.version = :ver', { ver: query.version });
    if (query.startingDate) qb.andWhere('d.created_at >= :startDate', { startDate: query.startingDate });
    if (query.endingDate) qb.andWhere('d.created_at <= :endDate', { endDate: query.endingDate });
    // backDateType (truthy) forces back_date_mode = true; backDateMode only applies otherwise.
    if (query.backDateType) {
      qb.andWhere('d.back_date_mode = :bdmTrue', { bdmTrue: true }).andWhere('d.back_date_type = :bdt', {
        bdt: query.backDateType,
      });
    } else if (query.backDateMode !== undefined && query.backDateMode !== null) {
      qb.andWhere('d.back_date_mode = :bdm', { bdm: query.backDateMode });
    }
    if (query.createdByIds) {
      const ids = query.createdByIds
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => n > 0);
      if (ids.length) qb.andWhere('d.uploaded_by_id IN (:...cbids)', { cbids: ids });
    }
    if (query.updatedByIds) {
      const ids = query.updatedByIds
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => n > 0);
      if (ids.length) qb.andWhere('d.updated_by_id IN (:...ubids)', { ubids: ids });
    }
    if (query.approvedByIds) {
      const ids = query.approvedByIds
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => n > 0);
      if (ids.length) qb.andWhere('d.approved_by_id IN (:...abids)', { abids: ids });
    }
    if (query.rejectedByIds) {
      const ids = query.rejectedByIds
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => n > 0);
      if (ids.length) qb.andWhere('d.rejected_by_id IN (:...rbids)', { rbids: ids });
    }
  }

  // Strapi parity (getDocumentStats): aggregate by status over the same filter set as list,
  // hard-limited to SUBMIT/APPROVAL/REJECTED (DRAFT excluded). Returns {total,SUBMIT,APPROVAL,REJECTED}.
  async stats(programId: number, query: SearchBiPaymentDocumentDto, userId: number | undefined) {
    if (!userId) throw new ForbiddenException('User not authenticated');
    if (!programId || !Number.isFinite(programId) || programId <= 0) {
      throw new BadRequestException('programId required');
    }
    const scopes = await this.stepScope.resolveWorkstepScopesOrEmpty(userId, programId);
    if (scopes.size === 0) return { total: 0, SUBMIT: 0, APPROVAL: 0, REJECTED: 0 };
    const qb = this.buildDocQuery();
    this.applyProgramFilter(qb, programId);
    this.applyWorkstepFilter(qb, undefined, scopes, userId);
    this.applyListFilters(qb, query);
    qb.andWhere('d.document_status IN (:...visible)', {
      visible: ['submit', 'approval', 'rejected'],
    });
    const row = await qb
      .select('COUNT(*)', 'total')
      .addSelect(`COUNT(CASE WHEN d.document_status = 'submit' THEN 1 END)`, 'SUBMIT')
      .addSelect(`COUNT(CASE WHEN d.document_status = 'approval' THEN 1 END)`, 'APPROVAL')
      .addSelect(`COUNT(CASE WHEN d.document_status = 'rejected' THEN 1 END)`, 'REJECTED')
      .getRawOne<{ total: string; SUBMIT: string; APPROVAL: string; REJECTED: string }>();
    return {
      total: Number(row?.total ?? 0),
      SUBMIT: Number(row?.SUBMIT ?? 0),
      APPROVAL: Number(row?.APPROVAL ?? 0),
      REJECTED: Number(row?.REJECTED ?? 0),
    };
  }

  // Strapi parity (checkS3StatusByDocumentIds): query ids (csv) → per-doc s3_upload_status
  // for the subset the caller may see (step-scope at each doc's program).
  async uploadStatus(idsCsv: string | undefined, userId: number | undefined) {
    if (!userId) throw new ForbiddenException('User not authenticated');
    const ids = (idsCsv ?? '')
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n > 0);
    if (!ids.length) return [];
    const docs = await this.docRepo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.template', 't')
      .where('d.deleted_at IS NULL')
      .andWhere('d.id IN (:...ids)', { ids })
      .getMany();
    const result: Array<{ id: number; s3_upload_status: string }> = [];
    for (const doc of docs) {
      // step-scope: caller must hold the doc's step at its program.
      const ok = await this.checkDocStep(userId, doc);
      if (ok) result.push({ id: doc.id, s3_upload_status: doc.s3_upload_status });
    }
    return result;
  }

  // Coerce + validate the optional `workstep` query value into the enum.
  // Empty/absent → undefined (caller applies the allowed-union filter).
  // Invalid → 400 so clients learn the contract instead of silent ignore.
  private parseWorkstepType(value?: string): MaToolWorkstepType | undefined {
    if (!value) return undefined;
    if (!Object.values(MaToolWorkstepType).includes(value as MaToolWorkstepType)) {
      throw new BadRequestException(`Invalid workstep: ${value}`);
    }
    return value as MaToolWorkstepType;
  }

  // Upload — DTO camelCase (Strapi parity). Service map → entity snake_case.
  // workStep trong body (EworkstepType) — validate khớp template.workstep_type.
  async upload(dto: UploadBiPaymentDocumentDto, scope: DataScope | null, userId?: number) {
    if (!userId) throw new ForbiddenException('User not authenticated');
    await this.assertProgramInScope(dto.programId, scope);
    const workstep = this.parseWorkstepType(dto.workStep);
    if (!workstep) throw new BadRequestException('workStep required');
    const hasFullUpload = await this.stepScope.hasProgramCapability(userId, dto.programId, UPLOAD_CODE);
    const hasReconUpload =
      !hasFullUpload &&
      workstep === MaToolWorkstepType.RECON_DATA &&
      (await this.stepScope.hasProgramCapability(userId, dto.programId, RECON_UPLOAD_CODE));
    if (!hasFullUpload && !hasReconUpload) {
      throw new ForbiddenException('No upload permission for workstep');
    }
    const template = await this.templateRepo.findOne({ where: { id: dto.templateId } });
    if (!template) throw new NotFoundException('Template not found');
    if (template.workstep_type !== workstep) {
      throw new ForbiddenException(
        `Template workstep_type mismatch (expected ${template.workstep_type}, got ${workstep})`,
      );
    }
    if (template.bi_payment_program_id !== dto.programId) {
      throw new ForbiddenException('Template does not belong to this program');
    }
    const doc = this.docRepo.create({
      document_name: dto.name,
      document_code: dto.name,
      notes: dto.description,
      file_url: dto.fileUrl,
      file_size: dto.fileSize,
      document_status: dto.status,
      s3_destination_path: dto.s3DestinationPath,
      back_date_mode: dto.backDateMode,
      back_date_type: dto.backDateType,
      back_date_file_id: dto.backDateFileId,
      template_id: dto.templateId,
      program_id: dto.programId,
      bi_payment_checklist_id: dto.checklistId,
      uploaded_by_id: userId,
      // A freshly uploaded doc's last editor is its uploader (backs user-updated).
      updated_by_id: userId,
    } as unknown as Partial<BiPaymentDocument>);
    const saved = await this.docRepo.save(doc);
    return { id: saved.id };
  }

  // Strapi parity (findOneDocumentById): single doc + flags.
  // is_exist_validation_log: false — NestJS has no ma_tool_validation_logs table (TODO if needed).
  // isCanUpdateStatus: true if the caller holds the doc's step at its program (BICC-of-program proxy).
  async findOne(docId: number, admin: AdminFlag, userId?: number) {
    const doc = await this.loadDocWithWorkstep(docId);
    await this.assertDocStep(userId, doc, admin);
    const canUpdate = await this.canUpdateAnyStatus(doc, userId, admin);
    return { ...doc, is_exist_validation_log: false, isCanUpdateStatus: canUpdate };
  }

  async download(docId: number, admin: AdminFlag, userId?: number) {
    const doc = await this.loadDocWithWorkstep(docId);
    await this.assertDocStep(userId, doc, admin);
    return doc;
  }

  // Strapi parity (mergeFile): body {documentIds, mode, templateId}. Resolve program from
  // template; permission = step-scope at that program. Create a log_merge_files row (PROCESSING).
  // NOTE: NestJS has no async merge-job infra (BIPaymentService.mergeFile) — the log is created
  // but no actual merge runs. TODO: wire the job when infra exists.
  async merge(dto: { documentIds: number[]; mode: 'csv' | 'excel'; templateId: number }, userId?: number) {
    if (!userId) throw new ForbiddenException('User not authenticated');
    const template = await this.templateRepo.findOne({ where: { id: dto.templateId } });
    if (!template) throw new NotFoundException('Template not found');
    const programId = template.bi_payment_program_id;
    if (!programId) throw new NotFoundException('Template has no program');
    if (!(await this.stepScope.hasProgramCapability(userId, programId, UPLOAD_CODE))) {
      throw new ForbiddenException('No merge permission for program');
    }
    const docs = await this.docRepo
      .createQueryBuilder('d')
      .where('d.id IN (:...ids)', { ids: dto.documentIds })
      .andWhere('d.program_id = :pid', { pid: programId })
      .getMany();
    if (!docs.length) throw new NotFoundException('Some documents not found in program');
    const modeEnum = dto.mode === 'csv' ? BiPaymentLogMergeFileMode.CSV : BiPaymentLogMergeFileMode.EXCEL;
    const name = `merge-program-${programId}-${dto.mode}`;
    const log = this.mergeRepo.create({
      name,
      documents: docs.map((d) => ({ id: d.id, program_id: d.program_id })),
      merge_status: BiPaymentLogMergeFileStatus.PROCESSING,
      destination_path: null,
      mode: modeEnum,
      user: userId ? { id: userId } : null,
    } as unknown as Partial<BiPaymentLogMergeFile>);
    const saved = await this.mergeRepo.save(log);
    return { id: saved.id, name: `${name}.${dto.mode === 'csv' ? 'csv' : 'xlsx'}` };
  }

  // Strapi parity (checkStatusDocumentMergedIssueReconilation): {id, name, status}.
  async getMergeStatus(logId: number, admin: AdminFlag, userId?: number) {
    const log = await this.mergeRepo.findOne({ where: { id: logId } });
    if (!log) throw new NotFoundException('Merge log not found');
    await this.assertMergeInScope(log, admin, userId);
    const ext = log.mode === BiPaymentLogMergeFileMode.CSV ? 'csv' : 'xlsx';
    return { id: log.id, name: `${log.name}.${ext}`, status: log.merge_status };
  }

  // download-merged: only if merge_status=COMPLETED. Returns log metadata (streaming deferred to media pipeline).
  async downloadMerged(logId: number, admin: AdminFlag, userId?: number) {
    const log = await this.mergeRepo.findOne({ where: { id: logId } });
    if (!log) throw new NotFoundException('Merge log not found');
    await this.assertMergeInScope(log, admin, userId);
    if (log.merge_status !== BiPaymentLogMergeFileStatus.COMPLETED) {
      throw new ForbiddenException('Merge not completed');
    }
    return log;
  }

  // Merge-log scope: at least one of its documents' programs must be in caller scope.
  private async assertMergeInScope(log: BiPaymentLogMergeFile, admin: AdminFlag, userId?: number): Promise<void> {
    if (admin.isAdmin) return; // super-admin bypass
    if (!userId) throw new ForbiddenException('User not authenticated');
    const docs = Array.isArray((log as unknown as { documents?: unknown[] }).documents)
      ? (log as unknown as { documents: Array<{ program_id?: number }> }).documents
      : [];
    if (!docs.length) throw new ForbiddenException('No permission');
    const programIds = [...new Set(docs.map((doc) => doc.program_id).filter((id): id is number => id != null))];
    for (const programId of programIds) {
      if (await this.stepScope.hasProgramCapability(userId, programId, UPLOAD_CODE)) return;
    }
    throw new ForbiddenException('No permission');
  }

  // Strapi parity (updateStatusDocuments): batch {ids, status, rejectionReason}.
  // Only docs in an INPROGRESS program + ACTIVE project; APPROVAL/REJECTED require the caller
  // to hold the doc's step at its program (BICC proxy) AND the doc currently SUBMIT.
  // Returns {success, error, idsSuccess, idsError}.
  async updateStatus(
    dto: { ids: number[]; status: string; rejectionReason?: string },
    userId?: number,
    admin: AdminFlag = { isAdmin: false },
  ) {
    if (!userId) throw new ForbiddenException('User not authenticated');
    if (!['submit', 'approval', 'rejected'].includes(dto.status)) {
      throw new BadRequestException('Invalid status');
    }
    const docs = await this.docRepo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.template', 't')
      .innerJoin('d.program', 'pg', 'pg.deleted_at IS NULL')
      .where('d.deleted_at IS NULL')
      .andWhere('d.id IN (:...ids)', { ids: dto.ids })
      .andWhere('pg.progress_status = :ps', { ps: BiPaymentProgressStatus.INPROGRESS })
      .getMany();
    if (!docs.length) throw new NotFoundException('No matching documents');
    const idsSuccess: number[] = [];
    const capabilityCache = new Map<string, Promise<boolean>>();
    const hasCapability = (programId: number, code: string) => {
      if (admin.isAdmin) return Promise.resolve(true);
      const key = `${programId}:${code}`;
      const cached = capabilityCache.get(key);
      if (cached !== undefined) return cached;
      const resolved = this.stepScope.hasProgramCapability(userId, programId, code);
      capabilityCache.set(key, resolved);
      return resolved;
    };

    for (const doc of docs) {
      const workstep = doc.template?.workstep_type;
      if (!workstep || !doc.program_id) continue;

      if (!(await this.canSetDocumentStatus(doc, dto.status, userId, admin, hasCapability))) continue;
      doc.document_status = dto.status;
      // Every status change records the editor (backs updatedByIds + user-updated).
      doc.updated_by_id = userId;
      if (dto.status === 'approval') {
        doc.approved_by_id = userId;
        doc.approved_at = new Date();
      } else if (dto.status === 'rejected') {
        doc.rejected_by_id = userId;
        doc.rejected_at = new Date();
      }
      await this.docRepo.save(doc);
      idsSuccess.push(doc.id);
    }
    const idsError = dto.ids.filter((id) => !idsSuccess.includes(id));
    return { success: idsSuccess.length, error: idsError.length, idsSuccess, idsError };
  }

  // Strapi parity (findUser*Document): enumerate DISTINCT users (id+email) who
  // created/updated/approved/rejected bi-payment docs the caller may see, with
  // optional keyword (email ILIKE) + pagination. Columns: uploaded_by_id (created),
  // updated_by_id (last editor), approved_by_id, rejected_by_id.
  async listUserCreated(keyword: string | undefined, pagination: PaginationParams, userId?: number) {
    return this.distinctUsersByColumn('d.uploaded_by_id', keyword, pagination, userId);
  }

  async listUserUpdated(keyword: string | undefined, pagination: PaginationParams, userId?: number) {
    return this.distinctUsersByColumn('d.updated_by_id', keyword, pagination, userId);
  }

  async listUserApproved(keyword: string | undefined, pagination: PaginationParams, userId?: number) {
    return this.distinctUsersByColumn('d.approved_by_id', keyword, pagination, userId);
  }

  async listUserRejected(keyword: string | undefined, pagination: PaginationParams, userId?: number) {
    return this.distinctUsersByColumn('d.rejected_by_id', keyword, pagination, userId);
  }

  // Distinct users (id + email) who touched docs (via `userCol`) within programs the caller
  // holds a step at. Scoped to bi-payment docs only (document_type implied by table).
  private async distinctUsersByColumn(
    userCol: string,
    keyword: string | undefined,
    pagination: PaginationParams,
    userId?: number,
  ) {
    if (!userId) throw new ForbiddenException('User not authenticated');
    const [uploadPrograms, reconPrograms, approvePrograms] = await Promise.all([
      this.getAccessibleProgramIds(userId, [UPLOAD_CODE]),
      this.getAccessibleProgramIds(userId, [RECON_UPLOAD_CODE]),
      this.getAccessibleProgramIds(userId, [APPROVE_CODE]),
    ]);
    if (!uploadPrograms.length && !reconPrograms.length && !approvePrograms.length) {
      return { data: [], meta: { total: 0, page: pagination.page, limit: pagination.limit } };
    }
    const kw = keyword?.trim() ? `%${keyword.trim().toLowerCase()}%` : undefined;

    // Count query: COUNT(DISTINCT userCol) over the same joins/filters (no paging).
    // meta.total must reflect the full match set, not the page-row count.
    const countQb = this.docRepo
      .createQueryBuilder('d')
      .innerJoin('d.template', 't', 't.deleted_at IS NULL')
      .innerJoin('users', 'u', `u.id = ${userCol} AND u.deleted_at IS NULL`)
      .where('d.deleted_at IS NULL')
      .andWhere(`${userCol} IS NOT NULL`)
      .select(`COUNT(DISTINCT ${userCol})`, 'count');
    this.applyCrossProgramScope(countQb, uploadPrograms, reconPrograms, approvePrograms, userId, userCol);
    if (kw) countQb.andWhere('LOWER(u.email) ILIKE :kw', { kw });
    const totalRow = await countQb.getRawOne<{ count: string }>();
    const total = totalRow ? Number(totalRow.count) : 0;

    // Page query: DISTINCT userCol + email, ordered + paged.
    const qb = this.docRepo
      .createQueryBuilder('d')
      .innerJoin('d.template', 't', 't.deleted_at IS NULL')
      .innerJoin('users', 'u', `u.id = ${userCol} AND u.deleted_at IS NULL`)
      .where('d.deleted_at IS NULL')
      .andWhere(`${userCol} IS NOT NULL`)
      .select(`DISTINCT ${userCol}`, 'id')
      .addSelect('u.email', 'email');
    this.applyCrossProgramScope(qb, uploadPrograms, reconPrograms, approvePrograms, userId, userCol);
    if (kw) qb.andWhere('LOWER(u.email) ILIKE :kw', { kw });
    qb.orderBy('u.id', 'DESC')
      .skip((pagination.page - 1) * pagination.limit)
      .take(pagination.limit);
    const rows = await qb.getRawMany<{ id: number; email: string }>();
    const data = rows.map((r) => ({ id: Number(r.id), email: r.email }));
    return { data, meta: { total, page: pagination.page, limit: pagination.limit } };
  }

  // Keep cross-program visibility permission-code specific. A full upload grant
  // on program A must not widen an own-only recon grant on program B.
  private applyCrossProgramScope(
    qb: SelectQueryBuilder<BiPaymentDocument>,
    uploadPrograms: number[],
    reconPrograms: number[],
    approvePrograms: number[],
    userId: number,
    userCol: string,
  ) {
    const clauses: string[] = [];
    const params: Record<string, unknown> = { crossScopeUserId: userId };
    if (uploadPrograms.length) {
      clauses.push('d.program_id IN (:...crossUploadPrograms)');
      params.crossUploadPrograms = uploadPrograms;
    }
    if (approvePrograms.length) {
      clauses.push('(d.program_id IN (:...crossApprovePrograms) AND t.workstep_type IN (:...crossApproveWorksteps))');
      params.crossApprovePrograms = approvePrograms;
      params.crossApproveWorksteps = [MaToolWorkstepType.PREPARE, MaToolWorkstepType.EX_PREPARE];
    }
    if (reconPrograms.length) {
      clauses.push(
        `(d.program_id IN (:...crossReconPrograms) AND t.workstep_type = :crossReconWorkstep AND d.uploaded_by_id = :crossScopeUserId AND ${userCol} = :crossScopeUserId)`,
      );
      params.crossReconPrograms = reconPrograms;
      params.crossReconWorkstep = MaToolWorkstepType.RECON_DATA;
    }
    qb.andWhere(`(${clauses.join(' OR ')})`, params);
  }

  private async getAccessibleProgramIds(userId: number, codes: readonly string[]): Promise<number[]> {
    const sets = await Promise.all(
      codes.map((c) => this.permCache.getAccessibleRecords(userId, 'bi_payment_programs', c)),
    );
    return [...new Set(sets.flat())];
  }

  // Scope assert — check program row directly (handles zero-doc programs).
  private async assertProgramInScope(programId: number | null, scope: DataScope | null): Promise<void> {
    if (scope === null) return; // admin path
    if (!programId) throw new ForbiddenException('No permission');
    const qb = this.programRepo.createQueryBuilder('pg').select('1', 'one').where('pg.id = :pid', { pid: programId });
    applyDataScope(qb, 'pg', PROGRAM_TABLE, scope);
    const ok = await qb.getRawOne<{ one: number }>();
    if (!ok) throw new ForbiddenException('No permission');
  }

  // Load a document together with its template's workstep_type. The join is
  // required for step-scoped checks (download/delete/updateStatus) — the step a
  // doc belongs to is its template's workstep_type, not a column on the doc row.
  private async loadDocWithWorkstep(docId: number): Promise<BiPaymentDocument> {
    const doc = await this.docRepo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.template', 't')
      .leftJoinAndSelect('d.program', 'pg')
      .where('d.id = :id', { id: docId })
      .getOne();
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  // Step-scoped assert for a single document: resolve the allowed worksteps at
  // the doc's program and require the doc's template workstep to be among them.
  // Admin path (scope === null) skips the check. Throws ForbiddenException otherwise.
  private async assertDocStep(userId: number | undefined, doc: BiPaymentDocument, admin: AdminFlag): Promise<void> {
    if (admin.isAdmin) return; // super-admin bypass
    const ok = await this.checkDocStep(userId, doc);
    if (!ok) throw new ForbiddenException('No permission for workstep');
  }

  // Non-throwing step-scope check for a single doc. Admin (super_admin) passes via
  // resolveAllowedWorksteps own-all path; non-admin must hold the doc's step at its program.
  private async checkDocStep(userId: number | undefined, doc: BiPaymentDocument): Promise<boolean> {
    if (!userId) return false;
    if (!doc.program_id || !doc.template?.workstep_type) return false;
    const scopes = await this.stepScope.resolveWorkstepScopesOrEmpty(userId, doc.program_id);
    const scope = scopes.get(doc.template.workstep_type);
    if (!scope) return false;
    return !scope.own || doc.uploaded_by_id === userId;
  }

  private async canUpdateAnyStatus(
    doc: BiPaymentDocument,
    userId: number | undefined,
    admin: AdminFlag,
  ): Promise<boolean> {
    if (!userId) return false;
    const hasCapability: CapabilityCheck = (programId, code) =>
      this.stepScope.hasProgramCapability(userId, programId, code);
    for (const status of ['submit', 'approval', 'rejected']) {
      if (await this.canSetDocumentStatus(doc, status, userId, admin, hasCapability)) return true;
    }
    return false;
  }

  private async canSetDocumentStatus(
    doc: BiPaymentDocument,
    status: string,
    userId: number,
    admin: AdminFlag,
    hasCapability: CapabilityCheck,
  ): Promise<boolean> {
    const workstep = doc.template?.workstep_type;
    if (!workstep || !doc.program_id || doc.program?.progress_status !== BiPaymentProgressStatus.INPROGRESS) {
      return false;
    }
    if (admin.isAdmin) return true;

    if (status === 'submit') {
      if (doc.uploaded_by_id !== userId) return false;
      return (
        (await hasCapability(doc.program_id, UPLOAD_CODE)) ||
        (workstep === MaToolWorkstepType.RECON_DATA && (await hasCapability(doc.program_id, RECON_UPLOAD_CODE)))
      );
    }

    if (!['approval', 'rejected'].includes(status)) return false;
    return (
      [MaToolWorkstepType.PREPARE, MaToolWorkstepType.EX_PREPARE].includes(workstep) &&
      doc.document_status === 'submit' &&
      (await hasCapability(doc.program_id, APPROVE_CODE))
    );
  }
}
