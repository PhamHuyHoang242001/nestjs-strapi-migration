import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Admins } from './admins.entity';
import { BiHubReports } from './bi_hub_reports.entity';

@Entity('admins_bi_hub_reports')
export class AdminsBiHubReports {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: false })
  admins_id: number;
  @ManyToOne(() => Admins)
  @JoinColumn({ name: 'admins_id' })
  admins?: Admins;

  @Column({ nullable: false })
  bi_hub_reports_id: number;
  @ManyToOne(() => BiHubReports)
  @JoinColumn({ name: 'bi_hub_reports_id' })
  bi_hub_reports?: BiHubReports;
}