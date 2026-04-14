import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { BiHubLabels } from './bi_hub_labels.entity';
import { Users } from './users.entity';

@Entity('bi_hub_labels_users')
export class BiHubLabelsUsers {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: false })
  bi_hub_labels_id: number;
  @ManyToOne(() => BiHubLabels)
  @JoinColumn({ name: 'bi_hub_labels_id' })
  bi_hub_labels?: BiHubLabels;

  @Column({ nullable: false })
  users_id: number;
  @ManyToOne(() => Users)
  @JoinColumn({ name: 'users_id' })
  users?: Users;
}