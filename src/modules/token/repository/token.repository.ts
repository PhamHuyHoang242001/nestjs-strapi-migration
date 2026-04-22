import { STATUS, TOKEN_TYPE } from '@common/enums';
import { BaseRepository } from '@common/repository/base-repository';
import { AUTH_FAIL, EXPIRED } from '@constant/error-messages';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as dayjs from 'dayjs';
import { DataSource, In, MoreThanOrEqual } from 'typeorm';
import { Token } from '../../databases/token.entity';

@Injectable()
export class TokenRepository extends BaseRepository<Token> {
  constructor(private dataSource: DataSource) {
    super(Token, dataSource);
  }
  findOneToken(accessToken: string): Promise<Token | undefined> {
    return this.findOne({
      where: { access_token: accessToken, status: STATUS.ACTIVE },
    });
  }
  async checkTokenValid(access_token: string, type: TOKEN_TYPE[]): Promise<Token | undefined> {
    const rs = await this.findOneByCondition({ access_token, type: In(type), status: STATUS.ACTIVE });
    if (!rs) throw new UnauthorizedException(AUTH_FAIL);
    if (rs.expired_at && dayjs(rs.expired_at).isBefore(dayjs())) throw new UnauthorizedException(EXPIRED);
    return rs;
  }

  async destroyTokenUser(user_id: number, type: Array<TOKEN_TYPE>): Promise<void> {
    const condition = { user_id, type: In(type), expired_at: MoreThanOrEqual(dayjs().toDate()) };
    await this.updateMany(condition, { status: STATUS.INACTIVE });
  }

  async destroyAllUserTokens(userId: number): Promise<void> {
    await this.updateMany({ user_id: userId }, { status: STATUS.INACTIVE });
  }

  async destroyTokenAdmin(admin_id: number, type: Array<TOKEN_TYPE>): Promise<void> {
    const condition = { admin_id, type: In(type), expired_at: MoreThanOrEqual(dayjs().toDate()) };
    await this.updateMany(condition, { status: STATUS.INACTIVE });
  }
}
