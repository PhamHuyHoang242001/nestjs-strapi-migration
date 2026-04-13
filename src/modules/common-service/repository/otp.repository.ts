import { BaseRepository } from '@common/repository/base-repository';
import { Otp } from '@modules/databases/otp.entity';
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class OtpRepository extends BaseRepository<Otp> {
  constructor(private dataSource: DataSource) {
    super(Otp, dataSource);
  }
}
