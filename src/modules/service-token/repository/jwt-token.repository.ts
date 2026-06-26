import { SortParams } from '@common/decorators/sort.decorator';
import { SortType } from '@common/enums';
import { BaseRepository } from '@common/repository/base-repository';
import { JwtToken, JWT_TOKEN_TYPE } from '@modules/databases/jwt-token.entity';
import { Injectable } from '@nestjs/common';
import { DataSource, SelectQueryBuilder } from 'typeorm';
import { ListServiceTokenDto } from '../dto/list-service-token.dto';

/** Columns exposed in list responses — intentionally excludes `token`. */
const SERVICE_TOKEN_LIST_FIELDS = ['st.id', 'st.name', 'st.type', 'st.expired_at', 'st.created_by', 'st.updated_by'];
/** Sort fields allowed on the list query (must stay in sync with controller @Sort allowedFields). */
const SERVICE_TOKEN_SORTABLE = new Set(['id', 'name']);

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
   */
  buildServiceTokenListQuery({ name }: ListServiceTokenDto, sortParams?: SortParams): SelectQueryBuilder<JwtToken> {
    const query = this.createQueryBuilder('st')
      .select(SERVICE_TOKEN_LIST_FIELDS)
      .where('st.type = :type', { type: JWT_TOKEN_TYPE.SERVICE_TOKEN })
      .andWhere('st.is_delete = :isDelete', { isDelete: false });

    if (name) query.andWhere('st.name ILIKE :name', { name: `%${name}%` });

    const sortField = sortParams && SERVICE_TOKEN_SORTABLE.has(sortParams.sort_field) ? sortParams.sort_field : 'id';
    const sortOrder = sortParams?.sort_order ?? SortType.DESC;
    query.orderBy(`st.${sortField}`, sortOrder);
    return query;
  }
}
