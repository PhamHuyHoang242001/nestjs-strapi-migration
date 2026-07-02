import { standardizePagination } from '@common/utils';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MaToolCstbRptProperty } from '@modules/databases/ma-tool-cstb-rpt-property.entity';
import { applyDataScope } from '@modules/data-access/helpers/data-scope-applier';
import type { DataScope } from '@common/authorization/types/data-scope.types';
import { SearchMaToolReportDto } from './dto/search-ma-tool-report.dto';

const TABLE = 'ma_tool_cstb_rpt_properties';

// Read-only access to MA Tool CSTB report properties, scoped by explicit data_access.
// Whole-table SO does NOT widen this read API: an SO role owns the sentinel id (0),
// which matches no real row in applyDataScope's owner branch — so SO members see only
// their explicit grants here (SO's "see all" lives in the records browser, getRecords).
// Both list and detail share the same applyDataScope predicate (single source).
@Injectable()
export class MaToolReportService {
  constructor(
    @InjectRepository(MaToolCstbRptProperty)
    private readonly repo: Repository<MaToolCstbRptProperty>,
  ) {}

  // ── List with pagination + data-access filtering ───────────────
  async findAll(query: SearchMaToolReportDto, scope: DataScope | null) {
    const page = +(query.page || 1);
    const limit = Math.min(+(query.limit || 10), 100);

    const qb = this.repo
      .createQueryBuilder('rpt')
      .where('rpt.deleted_at IS NULL')
      .andWhere('rpt.is_deleted IS NOT TRUE');

    applyDataScope(qb, 'rpt', TABLE, scope);

    if (query.keyword?.trim()) {
      const kw = `%${query.keyword.trim()}%`;
      qb.andWhere('(rpt.rpt_code ILIKE :kw OR rpt.rpt_owner ILIKE :kw)', { kw });
    }

    qb.orderBy('rpt.id', 'DESC');

    const data = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();
    const totalItems = await qb.getCount();

    return {
      data,
      meta: standardizePagination(totalItems, data.length, limit, page),
    };
  }

  // ── View single record ─────────────────────────────────────────
  // 404 = record truly absent. 403 = exists but outside caller's data scope.
  async findOne(id: number, scope: DataScope | null) {
    const record = await this.repo
      .createQueryBuilder('rpt')
      .where('rpt.id = :id', { id })
      .andWhere('rpt.deleted_at IS NULL')
      .andWhere('rpt.is_deleted IS NOT TRUE')
      .getOne();
    if (!record) throw new NotFoundException('Report not found');

    await this.assertInScope(id, scope);
    return record;
  }

  // ── Scope-check helper — single SQL existence probe ────────────
  private async assertInScope(id: number, scope: DataScope | null): Promise<void> {
    if (scope === null) return; // admin/internal path
    const qb = this.repo.createQueryBuilder('rpt').select('1', 'one').where('rpt.id = :id', { id });
    applyDataScope(qb, 'rpt', TABLE, scope);
    const ok = await qb.getRawOne();
    if (!ok) throw new ForbiddenException('No permission');
  }
}
