import { IsDate } from 'class-validator';
import { DeleteDateColumn } from 'typeorm';
import { BaseUuidColumn } from './base-uuid-column.entity';

export abstract class BaseSoftDeleteUuidEntity extends BaseUuidColumn {
  @DeleteDateColumn({ type: 'timestamp without time zone' })
  @IsDate()
  public deleted_at?: Date;
}
