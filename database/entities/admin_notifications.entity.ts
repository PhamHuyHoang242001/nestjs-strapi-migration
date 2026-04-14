import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Admins } from './admins.entity';

@Entity('admin_notifications')
export class AdminNotifications {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ type: 'int', nullable: true })
  admin_id?: number;
  @Column({ type: 'varchar', nullable: true })
  url?: string;
  @Column({ type: 'varchar', nullable: true })
  title?: string;
  @Column({ type: 'simple-json', nullable: true })
  content?: string;
  @Column({ type: 'simple-json', nullable: true })
  data?: string;
  @Column({ type: 'simple-json', nullable: true })
  meta?: string;
  @Column({ type: 'varchar', nullable: true })
  key?: string;
  @Column({ type: 'int', nullable: true })
  type?: number;
  @Column({ type: 'int', nullable: true })
  notify_status?: number;
  @Column({ type: 'timestamp', nullable: true })
  compiled_at?: string;
  @Column({ type: 'timestamp', nullable: true })
  received_at?: string;
  @Column({ type: 'timestamp', nullable: true })
  last_received_at?: string;
  @Column({ type: 'timestamp', nullable: true })
  read_at?: string;
  @Column({ type: 'boolean', nullable: true })
  is_read?: boolean;
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