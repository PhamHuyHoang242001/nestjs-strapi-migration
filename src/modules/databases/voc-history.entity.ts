import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity } from 'typeorm';

// Voice-of-Customer event history record
@Entity('voc_histories')
export class VocHistory extends BaseSoftDeleteEntity {
  @Column({ type: 'date', nullable: true })
  public date: string;

  @Column({ nullable: true })
  public type: string;

  @Column({ type: 'jsonb', nullable: true })
  public data: object;

  @Column({ nullable: true })
  public name: string;

  // FK to users — placeholder, no relation decorator until auth module ported
  @Column({ nullable: true, type: 'int' })
  public user_id: number;
}
