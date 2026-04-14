import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { MaToolTemplates } from './ma_tool_templates.entity';
import { Users } from './users.entity';

@Entity('ma_tool_templates_users')
export class MaToolTemplatesUsers {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: false })
  ma_tool_templates_id: number;
  @ManyToOne(() => MaToolTemplates)
  @JoinColumn({ name: 'ma_tool_templates_id' })
  ma_tool_templates?: MaToolTemplates;

  @Column({ nullable: false })
  users_id: number;
  @ManyToOne(() => Users)
  @JoinColumn({ name: 'users_id' })
  users?: Users;
}