import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { WinnovateCategory } from './winnovate-category.entity';
import { WinnovateGroup } from './winnovate-group.entity';
import { WinnovateTopic } from './winnovate-topic.entity';
import { WinnovateIdeaBookmark } from './winnovate-idea-bookmark.entity';

// Submitted innovation idea within the Winnovate platform
@Entity('winnovate_ideas')
export class WinnovateIdea extends BaseSoftDeleteEntity {
  @Column({ nullable: true, type: 'text' })
  public name: string;

  @Column({ nullable: true, type: 'text' })
  public email: string;

  @Column({ nullable: true, type: 'decimal' })
  public score: number;

  @Column({ nullable: true, type: 'text' })
  public target_customer: string;

  @Column({ nullable: true, type: 'text' })
  public desc_target_customer: string;

  @Column({ nullable: true, type: 'text' })
  public problem_statement: string;

  @Column({ nullable: true, type: 'text' })
  public idea_owner: string;

  @Column({ nullable: true, type: 'text' })
  public pdf_url: string;

  @Column({ nullable: true, type: 'text' })
  public solution: string;

  @Column({ nullable: true, type: 'int', default: 2 })
  public priority: number;

  @Column({ nullable: true })
  public is_published: boolean;

  // user_id: plain FK column; no relation decorator (user auth TBD)
  @Column({ nullable: true, type: 'int' })
  public user_id: number;

  // FK to winnovate_categories
  @Column({ nullable: true, type: 'int' })
  public winnovate_category_id: number;

  @ManyToOne(() => WinnovateCategory)
  @JoinColumn({ name: 'winnovate_category_id' })
  public category: WinnovateCategory;

  // FK to winnovate_groups
  @Column({ nullable: true, type: 'int' })
  public winnovate_group_id: number;

  @ManyToOne(() => WinnovateGroup)
  @JoinColumn({ name: 'winnovate_group_id' })
  public group: WinnovateGroup;

  // FK to winnovate_topics
  @Column({ nullable: true, type: 'int' })
  public winnovate_topic_id: number;

  @ManyToOne(() => WinnovateTopic)
  @JoinColumn({ name: 'winnovate_topic_id' })
  public topic: WinnovateTopic;

  // Reverse relation: bookmarks for this idea
  @OneToMany(() => WinnovateIdeaBookmark, (b) => b.idea)
  public bookmarks: WinnovateIdeaBookmark[];
}
