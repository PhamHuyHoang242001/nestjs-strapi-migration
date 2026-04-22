import { BaseRepository } from '@common/repository/base-repository';
import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Admins } from '@modules/databases/admin.entity';
import { NOT_FOUND } from '@constant/error-messages';

@Injectable()
export class AdminRepository extends BaseRepository<Admins> {
  constructor(private dataSource: DataSource) {
    super(Admins, dataSource);
  }
  async checkAdminValid(condition: object): Promise<Admins | undefined> {
    const admin = await this.findOneByCondition({ ...condition });
    if (!admin) throw new NotFoundException(NOT_FOUND);
    return admin;
  }
}
