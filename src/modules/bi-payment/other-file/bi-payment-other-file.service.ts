import { applyDataScope } from '@modules/data-access/helpers/data-scope-applier';
import { BiPaymentChecklist } from '@modules/databases/bi-payment-checklist.entity';
import { BiPaymentOtherFile } from '@modules/databases/bi-payment-other-file.entity';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SearchBiPaymentOtherFileDto, UploadBiPaymentOtherFileDto } from './dto';
import type { DataScope } from '@common/authorization/types/data-scope.types';

const TABLE = 'bi_payment_other_files';
const CHECKLIST_TABLE = 'bi_payment_checklists';

// Other-file = file đính kèm checklist. Record-scope = subtree checklist→program→project.
// Perm màn Chuẩn bị (bp_program_preparing) gắn ở controller. Sale ko có perm này.
@Injectable()
export class BiPaymentOtherFileService {
  constructor(
    @InjectRepository(BiPaymentOtherFile) private readonly repo: Repository<BiPaymentOtherFile>,
    @InjectRepository(BiPaymentChecklist) private readonly checklistRepo: Repository<BiPaymentChecklist>,
  ) {}

  // Upload batch — validates checklist exists + parent program in caller scope, then insert.
  // DTO camelCase (Strapi parity) → map entity snake_case.
  async upload(dto: UploadBiPaymentOtherFileDto, scope: DataScope | null, userId?: number) {
    // Scope-check the checklist itself (walks checklist→program→project→bicc via HIERARCHY_MAP).
    const qb = this.checklistRepo
      .createQueryBuilder('cl')
      .where('cl.id = :id', { id: dto.checkListId })
      .andWhere('cl.deleted_at IS NULL');
    applyDataScope(qb, 'cl', CHECKLIST_TABLE, scope);
    const checklist = await qb.getOne();
    if (!checklist) throw new NotFoundException('Checklist not found or out of scope');

    const rows = dto.files
      .filter((f) => f.fileUrl)
      .map((f) =>
        this.repo.create({
          name: f.name ?? null,
          file_url: f.fileUrl,
          file_size: f.fileSize ?? null,
          type: (f.type ?? '').toLowerCase(),
          bi_payment_checklist_id: dto.checkListId,
          orther_file_created_by_id: userId ?? null,
        } as unknown as Partial<BiPaymentOtherFile>),
      );

    if (!rows.length) return { success: 0, error: dto.files.length };
    const saved = await this.repo.save(rows);
    return { success: saved.length, error: dto.files.length - saved.length };
  }

  // List by program scope — other_files joined to checklist (program_id) then applyDataScope.
  async list(query: SearchBiPaymentOtherFileDto, scope: DataScope | null) {
    const qb = this.repo
      .createQueryBuilder('f')
      .innerJoin('f.bi_payment_checklist', 'cl', 'cl.deleted_at IS NULL')
      .innerJoin('cl.bi_payment_program', 'pg', 'pg.deleted_at IS NULL')
      .where('pg.id = :pid', { pid: query.programId })
      .andWhere('f.deleted_at IS NULL');
    applyDataScope(qb, 'f', TABLE, scope);
    if (query.keyword) qb.andWhere('f.name ILIKE :kw', { kw: `%${query.keyword.trim()}%` });
    if (query.type) qb.andWhere('f.type = :type', { type: query.type });
    const ids = this.parseIds(query.checkListIds);
    if (ids.length) qb.andWhere('cl.id IN (:...cids)', { cids: ids });
    qb.orderBy('f.created_at', 'DESC');
    return qb.getMany();
  }

  // user-created: other-files created by user (scope still applied for record visibility).
  async listUserCreated(userId: number, scope: DataScope | null) {
    const qb = this.repo
      .createQueryBuilder('f')
      .where('f.deleted_at IS NULL')
      .andWhere('f.orther_file_created_by_id = :uid', { uid: userId });
    applyDataScope(qb, 'f', TABLE, scope);
    qb.orderBy('f.created_at', 'DESC');
    return qb.getMany();
  }

  // download-multiple — load files (scope-checked), return file urls for client-side zip.
  // Streaming zip handled at controller layer; service returns metadata only.
  async getForDownload(ids: number[], scope: DataScope | null): Promise<BiPaymentOtherFile[]> {
    if (!ids.length) return [];
    const qb = this.repo
      .createQueryBuilder('f')
      .where('f.id IN (:...ids)', { ids })
      .andWhere('f.deleted_at IS NULL');
    applyDataScope(qb, 'f', TABLE, scope);
    return qb.getMany();
  }

  async delete(id: number, scope: DataScope | null) {
    const qb = this.repo.createQueryBuilder('f').where('f.id = :id', { id });
    applyDataScope(qb, 'f', TABLE, scope);
    const file = await qb.getOne();
    if (!file) throw new NotFoundException('Other file not found');
    await this.repo.softRemove(file);
    return { id: file.id };
  }

  private parseIds(raw?: string): number[] {
    if (!raw) return [];
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => /^\d+$/.test(s))
      .map(Number);
  }
}
