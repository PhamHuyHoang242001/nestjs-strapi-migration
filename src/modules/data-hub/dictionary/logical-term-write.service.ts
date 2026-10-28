import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { isUniqueViolation } from '../common/data-hub-pg-error.util';
import { liveSql } from '../common/data-hub-query.util';
import { termOfActiveServiceSql } from '../common/source-table-groups.util';
import { LogicalTermBodyDto } from './dto';
import { LogicalTermHistoryService } from './logical-term-history.service';
import { assertMappable, lockPhysicalTermsById, setPhysicalMapping } from './logical-term-mapping.util';

const CODE_UNIQUE = 'uq_data_hub_logical_terms_code_live';

@Injectable()
export class LogicalTermWriteService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly history: LogicalTermHistoryService,
  ) {}

  async create(dto: LogicalTermBodyDto, userId: number) {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const physicals = await this.lockAndCheckPhysicals(manager, dto.physical_term_ids, null);
        const rows: Array<{ id: number }> = await manager.query(
          `INSERT INTO data_hub_logical_terms (code, short_description, example_value, created_by)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [dto.code, dto.short_description, dto.example_value ?? null, userId],
        );
        const id = Number(rows[0].id);
        await setPhysicalMapping(
          manager,
          physicals.map((p) => p.id),
          id,
          userId,
        );
        const versionNo = await this.history.recordVersion(manager, id, userId, 'CREATE');
        return { id, code: dto.code, version_no: versionNo };
      });
    } catch (err) {
      this.rethrowCodeConflict(err);
    }
  }

  async update(id: number, dto: LogicalTermBodyDto, userId: number) {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const current: Array<{ code: string; short_description: string; example_value: string | null }> =
          await manager.query(
            `SELECT lt.code, lt.short_description, lt.example_value
             FROM data_hub_logical_terms lt WHERE lt.id = $1 AND ${liveSql('lt')} FOR UPDATE`,
            [id],
          );
        if (current.length === 0) throw new NotFoundException('LOGICAL_TERM_NOT_FOUND');
        // Requested and currently attached physicals are locked together in one id-ordered statement first, so
        // two concurrent edits touching the same physicals cannot lock them in opposite orders (deadlock).
        await manager.query(
          `SELECT p.id FROM data_hub_physical_terms p
           WHERE p.id = ANY($1) OR p.logical_term_id = $2 ORDER BY p.id FOR UPDATE OF p`,
          [dto.physical_term_ids, id],
        );
        const physicals = await this.lockAndCheckPhysicals(manager, dto.physical_term_ids, id);
        // Only physicals the form can see (active services) are replaced; mappings of inactive/deleted
        // services' terms are hidden from the form and must stay as they are.
        const attached: Array<{ id: number }> = await manager.query(
          `SELECT p.id FROM data_hub_physical_terms p
           WHERE p.logical_term_id = $1 AND ${termOfActiveServiceSql('p')} FOR UPDATE OF p`,
          [id],
        );
        const oldIds = attached.map((r) => Number(r.id));
        const newIds = physicals.map((p) => p.id);
        const removed = oldIds.filter((x) => !newIds.includes(x));
        const added = newIds.filter((x) => !oldIds.includes(x));
        const c = current[0];
        const fieldsSame =
          c.code === dto.code &&
          c.short_description === dto.short_description &&
          (c.example_value ?? null) === (dto.example_value ?? null);
        if (fieldsSame && removed.length === 0 && added.length === 0) throw new BadRequestException('NO_CHANGES');

        await manager.query(
          `UPDATE data_hub_logical_terms SET code = $2, short_description = $3, example_value = $4
           WHERE id = $1`,
          [id, dto.code, dto.short_description, dto.example_value ?? null],
        );
        await setPhysicalMapping(manager, removed, null, userId);
        await setPhysicalMapping(manager, added, id, userId);
        const versionNo = await this.history.recordVersion(manager, id, userId, 'UPDATE');
        return { id, code: dto.code, version_no: versionNo };
      });
    } catch (err) {
      this.rethrowCodeConflict(err);
    }
  }

  // Physicals must exist (live), be free or already attached to this term, and any newly attached one must be active.
  private async lockAndCheckPhysicals(manager: EntityManager, ids: number[], logicalTermId: number | null) {
    const physicals = await lockPhysicalTermsById(manager, ids);
    if (physicals.length !== new Set(ids).size) {
      const found = new Set(physicals.map((p) => p.id));
      throw new BadRequestException(`INVALID_PHYSICAL_TERMS: ${ids.filter((x) => !found.has(x)).join(', ')}`);
    }
    assertMappable(physicals, logicalTermId);
    return physicals;
  }

  private rethrowCodeConflict(err: unknown): never {
    if (isUniqueViolation(err, CODE_UNIQUE)) throw new ConflictException('LOGICAL_TERM_CODE_EXISTS');
    throw err;
  }
}
