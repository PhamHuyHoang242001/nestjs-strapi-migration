import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Admins } from './admins.entity';

@Entity('admin_notification_stats')
export class AdminNotificationStats {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ type: 'int', nullable: true })
  total?: number;
  @Column({ type: 'int', nullable: true })
  total_unread?: number;
  @Column({ type: 'int', nullable: true })
  total_unseen?: number;
  @Column({ type: 'int', nullable: true })
  admin_id?: number;
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