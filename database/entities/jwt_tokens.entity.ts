import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { FeedbackUsers } from './feedback_users.entity';
import { Admins } from './admins.entity';

export enum JwtTokensTypeEnum {
  ACCESS_TOKEN = 'access-token',
  REFRESH_TOKEN = 'refresh-token',
  SERVICE_TOKEN = 'service-token',
}

@Entity('jwt_tokens')
export class JwtTokens {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ type: 'text', nullable: true })
  token?: string;
  @Column({ type: 'timestamp', nullable: true })
  expired_at?: string;
  @Column({ type: 'enum', enum: JwtTokensTypeEnum, nullable: true })
  type?: JwtTokensTypeEnum;
  @Column({ nullable: true })
  user_id?: number;
  @ManyToOne(() => FeedbackUsers)
  @JoinColumn({ name: 'user_id' })
  user?: FeedbackUsers;
  @Column({ type: 'boolean', nullable: true })
  is_delete?: boolean;
  @Column({ type: 'text', nullable: true })
  name?: string;
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