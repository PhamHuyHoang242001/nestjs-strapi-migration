import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { FeedbackUsers } from './feedback_users.entity';
import { Admins } from './admins.entity';

export enum BiHubReportConfigsReportConfigStatusEnum {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Entity('bi_hub_report_configs')
export class BiHubReportConfigs {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ nullable: true })
  user_id?: number;
  @ManyToOne(() => FeedbackUsers)
  @JoinColumn({ name: 'user_id' })
  user?: FeedbackUsers;
  @Column({ type: 'simple-json', nullable: true })
  adhoc?: string;
  @Column({ type: 'simple-json', nullable: true })
  regular?: string;
  @Column({ type: 'enum', enum: BiHubReportConfigsReportConfigStatusEnum, nullable: true })
  report_config_status?: BiHubReportConfigsReportConfigStatusEnum;
  @Column({ nullable: true })
  admin_user_id?: number;
  @ManyToOne(() => Admins)
  @JoinColumn({ name: 'admin_user_id' })
  admin_user?: Admins;
  @Column({ nullable: true })
  created_by?: number;
  @ManyToOne(() => Admins)
  @JoinColumn({ name: 'created_by' })
  created_by_admin?: Admins;
  @Column({ nullable: true })
  updated_by?: number;
  @ManyToOne(() => Admins)
  @JoinColumn({ name: 'updated_by' })
  updated_by_admin?: Admins;
}