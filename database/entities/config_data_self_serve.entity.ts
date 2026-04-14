import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Admins } from './admins.entity';

@Entity('config_data_self_serve')
export class ConfigDataSelfServe {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ type: 'varchar', nullable: false })
  key?: string;
  @Column({ type: 'simple-json', nullable: false })
  value?: string;
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