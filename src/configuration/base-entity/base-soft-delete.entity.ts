import { IsDate } from 'class-validator';
import { DeleteDateColumn } from 'typeorm';
import { BaseColumn } from './base-column.entity';

export abstract class BaseSoftDeleteEntity extends BaseColumn {
  @DeleteDateColumn({ type: 'timestamp without time zone' })
  @IsDate()
  public deleted_at?: Date;
}
