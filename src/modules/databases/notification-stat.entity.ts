import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { Notification } from './notification.entity';

// Aggregated notification counters per user
@Entity('notification_stats')
export class NotificationStat extends BaseSoftDeleteEntity {
  @Column({ nullable: true, type: 'int' })
  public total: number;

  @Column({ nullable: true, type: 'int' })
  public total_unread: number;

  @Column({ nullable: true, type: 'int' })
  public total_unseen: number;

  // user_id: plain FK column; no relation decorator
  @Column({ nullable: true, type: 'int' })
  public user_id: number;

  // FK to notifications
  @Column({ nullable: true, type: 'int' })
  public notification_id: number;

  @ManyToOne(() => Notification, (n) => n.stats)
  @JoinColumn({ name: 'notification_id' })
  public notification: Notification;
}
