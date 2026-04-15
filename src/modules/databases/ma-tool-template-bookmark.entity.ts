import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { MaToolTemplate } from './ma-tool-template.entity';

// User bookmark for an MA Tool template
@Entity('ma_tool_template_bookmarks')
export class MaToolTemplateBookmark extends BaseSoftDeleteEntity {
  @Column({ nullable: true })
  public is_bookmarked: boolean;

  // FK to ma_tool_templates
  @Column({ nullable: false, type: 'int' })
  public template_id: number;

  @ManyToOne(() => MaToolTemplate, (t) => t.bookmarks)
  @JoinColumn({ name: 'template_id' })
  public template: MaToolTemplate;

  // user_id: plain nullable int, no decorator
  @Column({ nullable: true, type: 'int' })
  public user_id: number;
}
