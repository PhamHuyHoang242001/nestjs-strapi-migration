import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Admins } from './admins.entity';
import { MaToolWorkspaces } from './ma_tool_workspaces.entity';

@Entity('admins_ma_tool_workspaces')
export class AdminsMaToolWorkspaces {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: false })
  admins_id: number;
  @ManyToOne(() => Admins)
  @JoinColumn({ name: 'admins_id' })
  admins?: Admins;

  @Column({ nullable: false })
  ma_tool_workspaces_id: number;
  @ManyToOne(() => MaToolWorkspaces)
  @JoinColumn({ name: 'ma_tool_workspaces_id' })
  ma_tool_workspaces?: MaToolWorkspaces;
}