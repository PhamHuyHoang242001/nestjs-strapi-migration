import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Admins } from './admins.entity';

export enum LoginLogsClientStatusEnum {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  BLOCKED = 'blocked',
}

export enum LoginLogsClientTypeEnum {
  ADMIN = 'admin',
  USER = 'user',
}

export enum LoginLogsLogStatusEnum {
  SUCCESS = 'success',
  ERROR = 'error',
}

@Entity('login_logs')
export class LoginLogs {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ type: 'int', nullable: true })
  client_id?: number;
  @Column({ type: 'varchar', nullable: true })
  client_email?: string;
  @Column({ type: 'enum', enum: LoginLogsClientStatusEnum, nullable: true })
  client_status?: LoginLogsClientStatusEnum;
  @Column({ type: 'enum', enum: LoginLogsClientTypeEnum, nullable: true })
  client_type?: LoginLogsClientTypeEnum;
  @Column({ type: 'int', nullable: true })
  role_id?: number;
  @Column({ type: 'varchar', nullable: true })
  role_name?: string;
  @Column({ type: 'enum', enum: LoginLogsLogStatusEnum, nullable: true })
  log_status?: LoginLogsLogStatusEnum;
  @Column({ type: 'varchar', nullable: true })
  permission?: string;
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