import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { MaToolWorkspaces } from './ma_tool_workspaces.entity';
import { Users } from './users.entity';

@Entity('ma_tool_workspaces_users')
export class MaToolWorkspacesUsers {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: false })
  ma_tool_workspaces_id: number;
  @ManyToOne(() => MaToolWorkspaces)
  @JoinColumn({ name: 'ma_tool_workspaces_id' })
  ma_tool_workspaces?: MaToolWorkspaces;

  @Column({ nullable: false })
  users_id: number;
  @ManyToOne(() => Users)
  @JoinColumn({ name: 'users_id' })
  users?: Users;
}