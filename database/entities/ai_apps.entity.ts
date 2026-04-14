import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { AiAppApis } from './ai_app_apis.entity';
import { Admins } from './admins.entity';

@Entity('ai_apps')
export class AiApps {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ nullable: true })
  ai_app_api_id?: number;
  @ManyToOne(() => AiAppApis)
  @JoinColumn({ name: 'ai_app_api_id' })
  ai_app_api?: AiAppApis;
  @Column({ type: 'varchar', nullable: false })
  name?: string;
  @Column({ type: 'text', nullable: true })
  short_desc?: string;
  @Column({ type: 'varchar', nullable: true })
  image?: string;
  @Column({ type: 'varchar', nullable: false })
  bu?: string;
  @Column({ type: 'varchar', nullable: true })
  scope?: string;
  @Column({ type: 'varchar', nullable: false })
  po?: string;
  @Column({ type: 'simple-json', nullable: true })
  impact?: string;
  @Column({ type: 'varchar', nullable: true })
  pdf?: string;
  @Column({ type: 'int', nullable: true })
  total_quantity_used?: number;
  @Column({ type: 'varchar', nullable: false })
  email?: string;
  @Column({ type: 'varchar', nullable: true })
  ref_key?: string;
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