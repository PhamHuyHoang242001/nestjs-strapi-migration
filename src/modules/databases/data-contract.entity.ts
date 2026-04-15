import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { DataContractStatus } from '@common/enums/data-contract.enums';
import { Column, Entity, OneToMany } from 'typeorm';
import { Subscription } from './subscription.entity';
import { DownloadSampleLog } from './download-sample-log.entity';
import { DownloadResultLog } from './download-result-log.entity';
import { ViewLog } from './view-log.entity';

// Data contract defining access terms and schema for a data product
@Entity('data_contracts')
export class DataContract extends BaseSoftDeleteEntity {
  @Column({ unique: true })
  public title: string;

  @Column({ unique: true })
  public display_title: string;

  @Column()
  public version: string;

  @Column({ nullable: true, type: 'text' })
  public description: string;

  // Strapi lifecycle hook metadata stored as JSONB for later service porting
  @Column({ nullable: true, type: 'jsonb' })
  public metadata: Record<string, any>;

  @Column({ nullable: true, type: 'enum', enum: DataContractStatus })
  public custom_status: DataContractStatus;

  @Column({ nullable: true })
  public is_published: boolean;

  @OneToMany(() => Subscription, (s) => s.data_contract)
  public subscriptions: Subscription[];

  @OneToMany(() => DownloadSampleLog, (l) => l.data_contract)
  public download_sample_logs: DownloadSampleLog[];

  @OneToMany(() => DownloadResultLog, (l) => l.data_contract)
  public download_result_logs: DownloadResultLog[];

  @OneToMany(() => ViewLog, (l) => l.data_contract)
  public view_logs: ViewLog[];
}
