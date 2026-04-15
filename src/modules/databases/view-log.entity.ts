import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { DataContract } from './data-contract.entity';

// Audit log recording each data contract view event by a user
@Entity('view_logs')
export class ViewLog extends BaseSoftDeleteEntity {
  @Column({ nullable: true })
  public is_published: boolean;

  // plain FK; no User relation decorator
  @Column({ nullable: true, type: 'int' })
  public user_id: number;

  @Column({ nullable: true, type: 'int' })
  public data_contract_id: number;

  @ManyToOne(() => DataContract, (dc) => dc.view_logs)
  @JoinColumn({ name: 'data_contract_id' })
  public data_contract: DataContract;
}
