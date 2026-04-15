import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import {
  MaToolFrequency,
  MaToolTemplateStatus,
  MaToolTemplateType,
  MaToolUploadMethod,
  MaToolWorkstepType,
} from '@common/enums/ma-tool.enums';
import { Column, Entity, JoinColumn, JoinTable, ManyToMany, ManyToOne, OneToMany } from 'typeorm';
import { MaToolWorkspace } from './ma-tool-workspace.entity';
import { MaToolSheetTemplate } from './ma-tool-sheet-template.entity';
import { MaToolDocument } from './ma-tool-document.entity';
import { MaToolTemplateHistory } from './ma-tool-template-history.entity';
import { MaToolTemplateBookmark } from './ma-tool-template-bookmark.entity';

// MA Tool template — defines upload schema and lifecycle for a data template
@Entity('ma_tool_templates')
export class MaToolTemplate extends BaseSoftDeleteEntity {
  @Column({ nullable: true })
  public name: string;

  @Column({ nullable: true, type: 'text' })
  public description: string;

  @Column({ nullable: true })
  public image_url: string;

  @Column({ nullable: true, type: 'enum', enum: MaToolUploadMethod })
  public upload_method: MaToolUploadMethod;

  @Column({ nullable: true, type: 'enum', enum: MaToolFrequency })
  public upload_date_frequency: MaToolFrequency;

  @Column({ nullable: true, type: 'enum', enum: MaToolFrequency })
  public exploit_frequency: MaToolFrequency;

  @Column({ nullable: true, type: 'date' })
  public exploit_date: Date;

  @Column({ nullable: true, type: 'enum', enum: MaToolTemplateStatus })
  public template_status: MaToolTemplateStatus;

  @Column({ nullable: true, type: 'date' })
  public request_active_at: Date;

  @Column({ nullable: true, type: 'date' })
  public approved_at: Date;

  @Column({ nullable: true, type: 'date' })
  public activated_at: Date;

  @Column({ nullable: true, type: 'date' })
  public inactivated_at: Date;

  @Column({ nullable: true, type: 'date' })
  public rejected_at: Date;

  @Column({ nullable: true })
  public is_convert: boolean;

  @Column({ nullable: true })
  public is_deleted: boolean;

  @Column({ nullable: true, type: 'date' })
  public deleted_at_custom: Date;

  @Column({ nullable: true, type: 'int' })
  public version: number;

  @Column({ nullable: true, type: 'date' })
  public sending_date: Date;

  @Column({ nullable: true, type: 'date' })
  public ending_date: Date;

  @Column({ nullable: true, type: 'text' })
  public reason: string;

  @Column({ nullable: true, type: 'enum', enum: MaToolTemplateType })
  public template_type: MaToolTemplateType;

  @Column({ nullable: true, type: 'enum', enum: MaToolWorkstepType })
  public workstep_type: MaToolWorkstepType;

  // FK to ma_tool_workspaces (primary workspace)
  @Column({ nullable: true, type: 'int' })
  public workspace_id: number;

  @ManyToOne(() => MaToolWorkspace, (w) => w.templates)
  @JoinColumn({ name: 'workspace_id' })
  public workspace: MaToolWorkspace;

  // M:N inverse side — workspaces that own this template
  @ManyToMany(() => MaToolWorkspace, (w) => w.templates)
  public workspaces: MaToolWorkspace[];

  // M:N inverse — sharing/exploit workspaces
  @ManyToMany(() => MaToolWorkspace, (w) => w.sharing_templates)
  public exploit_workspaces: MaToolWorkspace[];

  // Nullable int FKs for user references (no relation decorator per rules)
  @Column({ nullable: true, type: 'int' })
  public template_created_by_id: number;

  @Column({ nullable: true, type: 'int' })
  public template_updated_by_id: number;

  @Column({ nullable: true, type: 'int' })
  public approved_by_id: number;

  @Column({ nullable: true, type: 'int' })
  public inactivated_by_id: number;

  @Column({ nullable: true, type: 'int' })
  public activated_by_id: number;

  @Column({ nullable: true, type: 'int' })
  public rejected_by_id: number;

  // bi_payment_program_id: plain nullable int FK (out-of-scope relation)
  @Column({ nullable: true, type: 'int' })
  public bi_payment_program_id: number;

  // Reverse relations
  @OneToMany(() => MaToolSheetTemplate, (s) => s.template)
  public sheet_templates: MaToolSheetTemplate[];

  @OneToMany(() => MaToolDocument, (d) => d.template)
  public documents: MaToolDocument[];

  @OneToMany(() => MaToolTemplateHistory, (h) => h.template)
  public histories: MaToolTemplateHistory[];

  @OneToMany(() => MaToolTemplateBookmark, (b) => b.template)
  public bookmarks: MaToolTemplateBookmark[];
}
