import { BaseRepository } from '@common/repository/base-repository';
import { JwtToken, JWT_TOKEN_TYPE } from '@modules/databases/jwt-token.entity';
import { Injectable } from '@nestjs/common';
import { DataSource, SelectQueryBuilder } from 'typeorm';
import { ListServiceTokenDto } from '../dto/list-service-token.dto';

/** Columns exposed in list responses — intentionally excludes `token`. */
const SERVICE_TOKEN_LIST_FIELDS = ['st.id', 'st.name', 'st.type', 'st.expired_at', 'st.created_by', 'st.updated_by'];
/** Whitelist mapping sortField (API) → column. Guards against orderBy injection. */
const SERVICE_TOKEN_SORT_MAP: Record<string, string> = { id: 'id', name: 'name' };

@Injectable()
export class JwtTokenRepository extends BaseRepository<JwtToken> {
  constructor(private dataSource: DataSource) {
    super(JwtToken, dataSource);
  }

  /** Active (non-deleted) service-token row for the given raw token string. */
  findActiveServiceToken(token: string): Promise<JwtToken | undefined> {
    return this.findOneByCondition({
      token,
      type: JWT_TOKEN_TYPE.SERVICE_TOKEN,
      is_delete: false,
    });
  }

  /** Active service-token by id (type-scoped, excludes soft-deleted). Includes `token`. */
  findActiveServiceTokenById(id: number): Promise<JwtToken | undefined> {
    return this.findOneByCondition({
      id,
      type: JWT_TOKEN_TYPE.SERVICE_TOKEN,
      is_delete: false,
    });
  }

  /**
   * List query for active service tokens. Always scoped to type=SERVICE_TOKEN + is_delete=false
   * (jwt_tokens is shared with access/refresh tokens). Selects metadata only — `token` is omitted.
   * Applies keyword (name ILIKE) + whitelisted sort. Pagination (skip/take) is applied by the caller.
   */
  buildServiceTokenListQuery({ keyword, sortField, sortValue }: ListServiceTokenDto): SelectQueryBuilder<JwtToken> {
    const query = this.createQueryBuilder('st')
      .select(SERVICE_TOKEN_LIST_FIELDS)
      .where('st.type = :type', { type: JWT_TOKEN_TYPE.SERVICE_TOKEN })
      .andWhere('st.is_delete = :isDelete', { isDelete: false });

    if (keyword?.trim()) query.andWhere('st.name ILIKE :keyword', { keyword: `%${keyword.trim()}%` });

    const sortCol = SERVICE_TOKEN_SORT_MAP[sortField || 'id'] || 'id';
    const sortDir = sortValue?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    query.orderBy(`st.${sortCol}`, sortDir);
    return query;
  }
}
