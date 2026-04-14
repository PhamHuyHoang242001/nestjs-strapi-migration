import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Admins } from './admins.entity';
import { BiHubHistoryReports } from './bi_hub_history_reports.entity';

@Entity('admins_bi_hub_history_reports')
export class AdminsBiHubHistoryReports {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: false })
  admins_id: number;
  @ManyToOne(() => Admins)
  @JoinColumn({ name: 'admins_id' })
  admins?: Admins;

  @Column({ nullable: false })
  bi_hub_history_reports_id: number;
  @ManyToOne(() => BiHubHistoryReports)
  @JoinColumn({ name: 'bi_hub_history_reports_id' })
  bi_hub_history_reports?: BiHubHistoryReports;
}