import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { FeedbackUsers } from './feedback_users.entity';
import { MaToolTemplates } from './ma_tool_templates.entity';
import { Admins } from './admins.entity';

@Entity('ma_tool_template_bookmarks')
export class MaToolTemplateBookmarks {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ nullable: true })
  user_id?: number;
  @ManyToOne(() => FeedbackUsers)
  @JoinColumn({ name: 'user_id' })
  user?: FeedbackUsers;
  @Column({ nullable: true })
  template_id?: number;
  @ManyToOne(() => MaToolTemplates)
  @JoinColumn({ name: 'template_id' })
  template?: MaToolTemplates;
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