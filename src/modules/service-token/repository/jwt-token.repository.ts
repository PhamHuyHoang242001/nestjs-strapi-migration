import { BaseRepository } from '@common/repository/base-repository';
import { JwtToken, JWT_TOKEN_TYPE } from '@modules/databases/jwt-token.entity';
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

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
}
