import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { FeedbackUsers } from './feedback_users.entity';
import { Admins } from './admins.entity';

@Entity('notifications')
export class Notifications {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ nullable: true })
  user_id?: number;
  @ManyToOne(() => FeedbackUsers)
  @JoinColumn({ name: 'user_id' })
  user?: FeedbackUsers;
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
  seen_at?: string;
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