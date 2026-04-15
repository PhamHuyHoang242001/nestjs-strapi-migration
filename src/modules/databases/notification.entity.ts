import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, OneToMany } from 'typeorm';
import { NotificationStat } from './notification-stat.entity';

// Notification sent to a user (receiver); sender is optional
@Entity('notifications')
export class Notification extends BaseSoftDeleteEntity {
  // Receiver user FK — plain int, no relation decorator
  @Column({ nullable: true, type: 'int' })
  public user_id: number;

  // Sender user FK — plain int, nullable
  @Column({ nullable: true, type: 'int' })
  public sender_id: number;

  @Column({ nullable: true })
  public url: string;

  @Column({ nullable: true })
  public title: string;

  @Column({ nullable: true, type: 'jsonb' })
  public content: object;

  @Column({ nullable: true, type: 'jsonb' })
  public data: object;

  @Column({ nullable: true, type: 'jsonb' })
  public meta: object;

  @Column({ nullable: true })
  public key: string;

  @Column({ nullable: true, type: 'int' })
  public type: number;

  @Column({ nullable: true, type: 'int' })
  public notify_status: number;

  @Column({ nullable: true, type: 'timestamp' })
  public compiled_at: Date;

  @Column({ nullable: true, type: 'timestamp' })
  public received_at: Date;

  @Column({ nullable: true, type: 'timestamp' })
  public last_received_at: Date;

  @Column({ nullable: true, type: 'timestamp' })
  public seen_at: Date;

  @Column({ nullable: true, type: 'timestamp' })
  public read_at: Date;

  @Column({ nullable: true, default: false })
  public is_read: boolean;

  @OneToMany(() => NotificationStat, (stat) => stat.notification)
  public stats: NotificationStat[];
}
