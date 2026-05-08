import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Admins } from './admin.entity';
import { BaseAuthorUserSoftDeleteColumn } from '@configuration/base-entity';

export enum BiHubLabelStatusEnum {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

// Label entity shared by BI Hub reports and BI Hub Diagnostic reports (via M:N junction tables)
@Entity('bi_hub_labels')
export class BiHubLabel extends BaseAuthorUserSoftDeleteColumn {
  @Column({ type: 'varchar', nullable: false })
  name: string;

  @Column({ type: 'enum', enum: BiHubLabelStatusEnum, nullable: true })
  status: BiHubLabelStatusEnum;

  @Column({ nullable: true })
  admin_id: number;

  @ManyToOne(() => Admins)
  @JoinColumn({ name: 'admin_id' })
  admin: Admins;
}
