import { PaginationParams } from '@common/decorators/pagination.decorator';
import { SortCamelParams } from '../common/decorators/sort-camel.decorator';
import { execQueryPaignation } from '@common/utils';
import { BiPaymentCategory } from '@modules/databases/bi-payment-category.entity';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateBiPaymentCategoryDto, SearchBiPaymentCategoryDto } from './dto';

// Category = config dùng chung (whole-table, ko record-scope). Service thuần CRUD.
// Perm gắn ở controller: create/delete theo quyền project create/edit; view theo project view.
@Injectable()
export class BiPaymentCategoryService {
  constructor(
    @InjectRepository(BiPaymentCategory) private readonly repo: Repository<BiPaymentCategory>,
  ) {}

  async create(dto: CreateBiPaymentCategoryDto) {
    const exists = await this.repo.findOne({ where: { name: dto.name } });
    if (exists) throw new BadRequestException('Category name already exists');
    const saved = await this.repo.save(this.repo.create({ name: dto.name }));
    return { id: saved.id };
  }

  // Public list — keyword + ids filter + pagination + sort.
  async search(query: SearchBiPaymentCategoryDto, sortParams: SortCamelParams, pagination: PaginationParams) {
    const qb = this.repo.createQueryBuilder('c').where('c.deleted_at IS NULL');
    if (query.keyword) {
      qb.andWhere('c.name ILIKE :kw', { kw: `%${query.keyword.trim()}%` });
    }
    const ids = this.parseIds(query.ids);
    if (ids.length) qb.andWhere('c.id IN (:...ids)', { ids });
    qb.orderBy(`c.${sortParams.sort_field}`, sortParams.sort_order);
    return execQueryPaignation(qb, pagination.page, pagination.limit);
  }

  async delete(id: number) {
    const category = await this.repo.findOne({ where: { id } });
    if (!category) throw new NotFoundException('Category not found');
    if (await this.isInUse(id)) {
      throw new BadRequestException('Category is in use by project/program');
    }
    await this.repo.softRemove(category);
    return { id };
  }

  // Soft-delete many — skip categories still referenced by project/program. Returns counts.
  async deleteMany(rawIds: string) {
    const ids = this.parseIds(rawIds);
    if (!ids.length) return { success: 0, error: 0 };
    const inUse = new Set<number>();
    for (const id of ids) {
      if (await this.isInUse(id)) inUse.add(id);
    }
    const deletable = ids.filter((id) => !inUse.has(id));
    if (deletable.length) {
      await this.repo.softDelete(deletable);
    }
    return { success: deletable.length, error: ids.length - deletable.length };
  }

  // Check references via join tables bi_payment_projects_categories / bi_payment_programs_categories.
  private async isInUse(id: number): Promise<boolean> {
    const rows: Array<{ id: string }> = await this.repo.manager.query(
      `SELECT 1 AS id
       FROM bi_payment_projects_categories WHERE bi_payment_category_id = $1
       UNION
       SELECT 1 AS id
       FROM bi_payment_programs_categories WHERE bi_payment_category_id = $1
       LIMIT 1`,
      [id],
    );
    return rows.length > 0;
  }

  // Parse comma-separated ids → int[]. Reject non-numeric tokens.
  private parseIds(raw?: string): number[] {
    if (!raw) return [];
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => /^\d+$/.test(s))
      .map(Number);
  }
}
