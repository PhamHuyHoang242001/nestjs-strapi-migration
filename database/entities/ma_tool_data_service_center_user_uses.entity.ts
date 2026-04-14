import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { FeedbackUsers } from './feedback_users.entity';
import { MaToolDataServiceCenters } from './ma_tool_data_service_centers.entity';
import { Admins } from './admins.entity';

@Entity('ma_tool_data_service_center_user_uses')
export class MaToolDataServiceCenterUserUses {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ nullable: true })
  user_id?: number;
  @ManyToOne(() => FeedbackUsers)
  @JoinColumn({ name: 'user_id' })
  user?: FeedbackUsers;
  @Column({ nullable: true })
  data_service_center_id?: number;
  @ManyToOne(() => MaToolDataServiceCenters)
  @JoinColumn({ name: 'data_service_center_id' })
  data_service_center?: MaToolDataServiceCenters;
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