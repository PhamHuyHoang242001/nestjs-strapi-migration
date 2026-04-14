import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Admins } from './admins.entity';

export enum NewsTypeEnum {
  FEATURE = 'FEATURE',
  MAINTENANCE = 'MAINTENANCE',
  INSTRUCT = 'INSTRUCT',
}

@Entity('news')
export class News {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ type: 'varchar', nullable: true })
  title?: string;
  @Column({ type: 'text', nullable: true })
  description?: string;
  @Column({ type: 'text', nullable: true })
  content?: string;
  @Column({ type: 'enum', enum: NewsTypeEnum, nullable: true })
  type?: NewsTypeEnum;
  // OneToMany inverse: news_viewers -> NewsViewers
  @Column({ type: 'simple-json', nullable: true })
  files?: string;
  @Column({ type: 'boolean', nullable: true })
  is_deleted?: boolean;
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