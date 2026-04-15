import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { DataContract } from './data-contract.entity';

// User subscription to a data contract
@Entity('subscriptions')
export class Subscription extends BaseSoftDeleteEntity {
  @Column({ nullable: true })
  public custom_status: string;

  @Column({ nullable: true })
  public is_published: boolean;

  // plain FK; no User relation decorator
  @Column({ nullable: true, type: 'int' })
  public user_id: number;

  @Column({ nullable: true, type: 'int' })
  public data_contract_id: number;

  @ManyToOne(() => DataContract, (dc) => dc.subscriptions)
  @JoinColumn({ name: 'data_contract_id' })
  public data_contract: DataContract;
}
