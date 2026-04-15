import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { DataContract } from './data-contract.entity';

// Audit log recording each result file download by a user
@Entity('download_result_logs')
export class DownloadResultLog extends BaseSoftDeleteEntity {
  @Column({ nullable: true })
  public file_name: string;

  @Column({ nullable: true })
  public is_published: boolean;

  // plain FK; no User relation decorator
  @Column({ nullable: true, type: 'int' })
  public user_id: number;

  @Column({ nullable: true, type: 'int' })
  public data_contract_id: number;

  @ManyToOne(() => DataContract, (dc) => dc.download_result_logs)
  @JoinColumn({ name: 'data_contract_id' })
  public data_contract: DataContract;
}
