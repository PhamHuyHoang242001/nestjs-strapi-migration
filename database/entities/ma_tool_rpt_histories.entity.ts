import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { MaToolCstbRptProperties } from './ma_tool_cstb_rpt_properties.entity';
import { Admins } from './admins.entity';

@Entity('ma_tool_rpt_histories')
export class MaToolRptHistories {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ nullable: true })
  report_id?: number;
  @ManyToOne(() => MaToolCstbRptProperties)
  @JoinColumn({ name: 'report_id' })
  report?: MaToolCstbRptProperties;
  @Column({ type: 'simple-json', nullable: true })
  change_log?: string;
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