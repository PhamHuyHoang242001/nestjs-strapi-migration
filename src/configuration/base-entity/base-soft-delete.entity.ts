import { IsDate } from 'class-validator';
import { Column, DeleteDateColumn } from 'typeorm';
import { BaseColumn } from './base-column.entity';

export abstract class BaseSoftDeleteEntity extends BaseColumn {
  @DeleteDateColumn({ type: 'timestamp without time zone' })
  @IsDate()
  public deleted_at?: Date;

  // Soft-delete flag paired with deleted_at; excluded from accessible-record resolution when true.
  // Inherited by every soft-delete entity so record-scope queries can filter it uniformly.
  @Column({ type: 'boolean', nullable: true, default: false })
  public is_deleted?: boolean;
}
