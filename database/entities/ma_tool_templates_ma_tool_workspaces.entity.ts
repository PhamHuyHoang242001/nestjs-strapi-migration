import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { MaToolTemplates } from './ma_tool_templates.entity';
import { MaToolWorkspaces } from './ma_tool_workspaces.entity';

@Entity('ma_tool_templates_ma_tool_workspaces')
export class MaToolTemplatesMaToolWorkspaces {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: false })
  ma_tool_templates_id: number;
  @ManyToOne(() => MaToolTemplates)
  @JoinColumn({ name: 'ma_tool_templates_id' })
  ma_tool_templates?: MaToolTemplates;

  @Column({ nullable: false })
  ma_tool_workspaces_id: number;
  @ManyToOne(() => MaToolWorkspaces)
  @JoinColumn({ name: 'ma_tool_workspaces_id' })
  ma_tool_workspaces?: MaToolWorkspaces;
}