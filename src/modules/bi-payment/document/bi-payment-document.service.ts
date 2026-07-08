import { applyDataScope } from '@modules/data-access/helpers/data-scope-applier';
import { BiPaymentDocument } from '@modules/databases/bi-payment-document.entity';
import { BiPaymentTemplate } from '@modules/databases/bi-payment-template.entity';
import { BiPaymentLogMergeFile } from '@modules/databases/bi-payment-log-merge-file.entity';
import { BiPaymentProgram } from '@modules/databases/bi-payment-program.entity';
import { MaToolWorkstepType } from '@common/enums/ma-tool.enums';
import { BiPaymentLogMergeFileStatus, BiPaymentLogMergeFileMode } from '@common/enums/bi-payment.enums';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SearchBiPaymentDocumentDto, UploadBiPaymentDocumentDto } from './dto';
import type { DataScope } from '@common/authorization/types/data-scope.types';

const DOC_TABLE = 'bi_payment_documents';
const PROGRAM_TABLE = 'bi_payment_programs';

// Map workstep_type template → permission code (caller gắn @RequirePermission, service chỉ
// lookup để validate template khớp endpoint). Sale chỉ gọi endpoint recon_data.
export const WORKSTEP_TYPE_PERM: Record<MaToolWorkstepType, string> = {
  [MaToolWorkstepType.PREPARE]: 'bp_program_preparing',
  [MaToolWorkstepType.RECON_DATA]: 'bp_program_reconciliation_sale',
  [MaToolWorkstepType.RECON_FEEDBACK]: 'bp_program_reconciliation_bicc',
  [MaToolWorkstepType.EX_PREPARE]: 'bp_program_preparing',
};

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
  ) {}

  // List documents theo program (optional) + workstep (query, optional). Scope theo program.
  // DTO camelCase (Strapi parity). workstep query (EworkstepType) filter template.workstep_type.
  async list(
    programId: number | undefined,
    query: SearchBiPaymentDocumentDto,
    scope: DataScope | null,
  ) {
    if (programId) await this.assertProgramInScope(programId, scope);
    const qb = this.docRepo
      .createQueryBuilder('d')
      .innerJoin('d.template', 't', 't.deleted_at IS NULL')
      .where('d.deleted_at IS NULL');
    if (programId) qb.andWhere('d.program_id = :pid', { pid: programId });
    if (query.workstep) qb.andWhere('t.workstep_type = :wt', { wt: query.workstep });
    if (query.templateIds) {
      const tids = query.templateIds.split(',').map((s) => Number(s.trim())).filter((n) => n > 0);
      if (tids.length) qb.andWhere('d.template_id IN (:...tids)', { tids });
    }
    if (query.checklistIds) {
      const cids = query.checklistIds.split(',').map((s) => Number(s.trim())).filter((n) => n > 0);
      if (cids.length) qb.andWhere('d.bi_payment_checklist_id IN (:...cids)', { cids });
    }
    if (query.status) qb.andWhere('d.document_status = :st', { st: query.status });
    if (query.workstepCurrent) qb.andWhere('d.document_status = :wsc', { wsc: query.workstepCurrent });
    if (query.s3UploadStatus) qb.andWhere('d.s3_upload_status = :s3', { s3: query.s3UploadStatus });
    applyDataScope(qb, 'd', DOC_TABLE, scope);
    qb.orderBy('d.created_at', 'DESC');
    return qb.getMany();
  }

  // Upload — DTO camelCase (Strapi parity). Service map → entity snake_case.
  // workStep trong body (EworkstepType) — validate khớp template.workstep_type.
  async upload(
    dto: UploadBiPaymentDocumentDto,
    scope: DataScope | null,
    userId?: number,
  ) {
    await this.assertProgramInScope(dto.programId, scope);
    const template = await this.templateRepo.findOne({ where: { id: dto.templateId } });
    if (!template) throw new NotFoundException('Template not found');
    if (template.workstep_type !== dto.workStep) {
      throw new ForbiddenException(`Template workstep_type mismatch (expected ${template.workstep_type}, got ${dto.workStep})`);
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
      uploaded_by_id: userId ?? null,
    } as unknown as Partial<BiPaymentDocument>);
    const saved = await this.docRepo.save(doc);
    return { id: saved.id };
  }

  async download(docId: number, scope: DataScope | null) {
    const doc = await this.docRepo
      .createQueryBuilder('d')
      .where('d.id = :id', { id: docId })
      .getOne();
    if (!doc) throw new NotFoundException('Document not found');
    await this.assertProgramInScope(doc.program_id, scope);
    return doc;
  }

  async delete(docId: number, scope: DataScope | null) {
    const doc = await this.docRepo.findOne({ where: { id: docId } });
    if (!doc) throw new NotFoundException('Document not found');
    await this.assertProgramInScope(doc.program_id, scope);
    await this.docRepo.softRemove(doc);
    return { id: doc.id };
  }

  // Merge file — gắn bp_program_confirm_release (caller verb-gate). Tạo log_merge_files row.
  async merge(programId: number, docIds: number[], mode: 'csv' | 'excel', scope: DataScope | null, userId?: number) {
    await this.assertProgramInScope(programId, scope);
    const docs = await this.docRepo
      .createQueryBuilder('d')
      .where('d.id IN (:...ids)', { ids: docIds })
      .andWhere('d.program_id = :pid', { pid: programId })
      .getMany();
    if (docs.length !== docIds.length) throw new NotFoundException('Some documents not found in program');
    const log = this.mergeRepo.create({
      name: `merge-program-${programId}-${mode}`,
      documents: docs,
      merge_status: BiPaymentLogMergeFileStatus.COMPLETED,
      destination_path: null,
      mode: mode === 'csv' ? BiPaymentLogMergeFileMode.CSV : BiPaymentLogMergeFileMode.EXCEL,
      user: userId ? { id: userId } : null,
    } as unknown as Partial<BiPaymentLogMergeFile>);
    const saved = await this.mergeRepo.save(log);
    return { id: saved.id, document_count: docs.length };
  }

  // Get merge status — load log_merge_files row, scope-checked via its documents' programs.
  async getMergeStatus(logId: number, scope: DataScope | null) {
    const log = await this.mergeRepo.findOne({ where: { id: logId } });
    if (!log) throw new NotFoundException('Merge log not found');
    await this.assertMergeInScope(log, scope);
    return log;
  }

  // download-merged — return merge log metadata, scope-checked. File streamed by media pipeline.
  async downloadMerged(logId: number, scope: DataScope | null) {
    const log = await this.mergeRepo.findOne({ where: { id: logId } });
    if (!log) throw new NotFoundException('Merge log not found');
    await this.assertMergeInScope(log, scope);
    return log;
  }

  // Merge-log scope: at least one of its documents' programs must be in caller scope.
  // Logs created by other users on programs the caller doesn't own are hidden.
  private async assertMergeInScope(log: BiPaymentLogMergeFile, scope: DataScope | null): Promise<void> {
    if (scope === null) return; // admin path
    const docs = Array.isArray((log as unknown as { documents?: unknown[] }).documents)
      ? ((log as unknown as { documents: Array<{ program_id?: number }> }).documents)
      : [];
    if (!docs.length) throw new ForbiddenException('No permission');
    for (const d of docs) {
      if (d.program_id != null) {
        try {
          await this.assertProgramInScope(d.program_id, scope);
          return; // one accessible document is enough
        } catch {
          continue; // try next doc
        }
      }
    }
    throw new ForbiddenException('No permission');
  }

  // update-status — patch document_status (per-workstep, scope-checked).
  async updateStatus(docId: number, status: string, scope: DataScope | null) {
    const doc = await this.docRepo.findOne({ where: { id: docId } });
    if (!doc) throw new NotFoundException('Document not found');
    await this.assertProgramInScope(doc.program_id, scope);
    doc.document_status = status;
    await this.docRepo.save(doc);
    return { id: doc.id, document_status: status };
  }

  // stats — count documents grouped by status within program scope.
  async stats(programId: number, scope: DataScope | null) {
    await this.assertProgramInScope(programId, scope);
    const rows: Array<{ document_status: string; count: string }> = await this.docRepo
      .createQueryBuilder('d')
      .select('d.document_status', 'document_status')
      .addSelect('COUNT(*)', 'count')
      .where('d.program_id = :pid', { pid: programId })
      .andWhere('d.deleted_at IS NULL')
      .groupBy('d.document_status')
      .getRawMany();
    return rows.map((r) => ({ status: r.document_status, count: Number(r.count) }));
  }

  // upload-status — count documents by s3_upload_status within program scope.
  async uploadStatus(programId: number, scope: DataScope | null) {
    await this.assertProgramInScope(programId, scope);
    const rows: Array<{ s3_upload_status: string; count: string }> = await this.docRepo
      .createQueryBuilder('d')
      .select('d.s3_upload_status', 's3_upload_status')
      .addSelect('COUNT(*)', 'count')
      .where('d.program_id = :pid', { pid: programId })
      .andWhere('d.deleted_at IS NULL')
      .groupBy('d.s3_upload_status')
      .getRawMany();
    return rows.map((r) => ({ upload_status: r.s3_upload_status, count: Number(r.count) }));
  }

  // user-created/updated/approved/rejected — documents touched by user (scope applied).
  async listUserCreated(userId: number, scope: DataScope | null) {
    return this.userScopedDocs('d.uploaded_by_id = :uid', userId, scope);
  }

  async listUserUpdated(userId: number, scope: DataScope | null) {
    return this.userScopedDocs('d.uploaded_by_id = :uid OR d.rejected_by_id = :uid', userId, scope);
  }

  async listUserApproved(userId: number, scope: DataScope | null) {
    return this.userScopedDocs('d.document_status = :st', userId, scope, { st: 'approved' });
  }

  async listUserRejected(userId: number, scope: DataScope | null) {
    return this.userScopedDocs('d.rejected_by_id = :uid', userId, scope);
  }

  private async userScopedDocs(
    where: string,
    userId: number,
    scope: DataScope | null,
    params: Record<string, unknown> = {},
  ) {
    const qb = this.docRepo
      .createQueryBuilder('d')
      .where('d.deleted_at IS NULL')
      .andWhere(where, { uid: userId, ...params });
    applyDataScope(qb, 'd', DOC_TABLE, scope);
    qb.orderBy('d.created_at', 'DESC');
    return qb.getMany();
  }

  // Scope assert — check program row directly (handles zero-doc programs).
  private async assertProgramInScope(programId: number | null, scope: DataScope | null): Promise<void> {
    if (scope === null) return; // admin path
    if (!programId) throw new ForbiddenException('No permission');
    const qb = this.programRepo
      .createQueryBuilder('pg')
      .select('1', 'one')
      .where('pg.id = :pid', { pid: programId });
    applyDataScope(qb, 'pg', PROGRAM_TABLE, scope);
    const ok = await qb.getRawOne();
    if (!ok) throw new ForbiddenException('No permission');
  }
}
