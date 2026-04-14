import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { BiHubBiccDepartments } from './bi_hub_bicc_departments.entity';
import { MaToolS3s } from './ma_tool_s3s.entity';

@Entity('bi_hub_bicc_departments_ma_tool_s3s')
export class BiHubBiccDepartmentsMaToolS3s {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: false })
  bi_hub_bicc_departments_id: number;
  @ManyToOne(() => BiHubBiccDepartments)
  @JoinColumn({ name: 'bi_hub_bicc_departments_id' })
  bi_hub_bicc_departments?: BiHubBiccDepartments;

  @Column({ nullable: false })
  ma_tool_s3s_id: number;
  @ManyToOne(() => MaToolS3s)
  @JoinColumn({ name: 'ma_tool_s3s_id' })
  ma_tool_s3s?: MaToolS3s;
}