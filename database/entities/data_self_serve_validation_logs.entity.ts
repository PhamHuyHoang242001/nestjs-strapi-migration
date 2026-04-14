import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { DataSelfServeRequests } from './data_self_serve_requests.entity';
import { Admins } from './admins.entity';

@Entity('data_self_serve_validation_logs')
export class DataSelfServeValidationLogs {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ type: 'int', nullable: true })
  total_column?: number;
  @Column({ type: 'int', nullable: true })
  total_row?: number;
  @Column({ type: 'simple-json', nullable: true })
  logs?: string;
  @Column({ nullable: true })
  request_id?: number;
  @ManyToOne(() => DataSelfServeRequests)
  @JoinColumn({ name: 'request_id' })
  request?: DataSelfServeRequests;
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