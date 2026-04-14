import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { AiApps } from './ai_apps.entity';
import { Admins } from './admins.entity';

export enum AiAppApisMethodEnum {
  POST = 'POST',
  GET = 'GET',
}

@Entity('ai_app_apis')
export class AiAppApis {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ nullable: true })
  ai_app_id?: number;
  @ManyToOne(() => AiApps)
  @JoinColumn({ name: 'ai_app_id' })
  ai_app?: AiApps;
  @Column({ type: 'varchar', nullable: false })
  name?: string;
  @Column({ type: 'varchar', nullable: false })
  endpoint?: string;
  @Column({ type: 'enum', enum: AiAppApisMethodEnum, nullable: true })
  method?: AiAppApisMethodEnum;
  @Column({ type: 'simple-json', nullable: true })
  form_data?: string;
  @Column({ type: 'text', nullable: false })
  token_value?: string;
  @Column({ type: 'varchar', nullable: false })
  token_key?: string;
  @Column({ type: 'text', nullable: true })
  short_desc?: string;
  @Column({ type: 'timestamp', nullable: true })
  token_expired_at?: string;
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