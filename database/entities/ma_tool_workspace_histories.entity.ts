import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { MaToolWorkspaces } from './ma_tool_workspaces.entity';
import { Admins } from './admins.entity';

@Entity('ma_tool_workspace_histories')
export class MaToolWorkspaceHistories {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ nullable: true })
  workspace_id?: number;
  @ManyToOne(() => MaToolWorkspaces)
  @JoinColumn({ name: 'workspace_id' })
  workspace?: MaToolWorkspaces;
  @Column({ type: 'simple-json', nullable: true })
  change_log?: string;
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