import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { FeedbackUsers } from './feedback_users.entity';
import { Admins } from './admins.entity';

@Entity('sub_folders')
export class SubFolders {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ type: 'varchar', nullable: true })
  path_name?: string;
  @Column({ nullable: true })
  user_created_id?: number;
  @ManyToOne(() => FeedbackUsers)
  @JoinColumn({ name: 'user_created_id' })
  user_created?: FeedbackUsers;
  @Column({ nullable: true })
  user_updated_id?: number;
  @ManyToOne(() => FeedbackUsers)
  @JoinColumn({ name: 'user_updated_id' })
  user_updated?: FeedbackUsers;
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