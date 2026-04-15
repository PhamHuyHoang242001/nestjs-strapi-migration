import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { WinnovateIdea } from './winnovate-idea.entity';

// Bookmark record linking a user to a saved Winnovate idea
@Entity('winnovate_idea_bookmarks')
export class WinnovateIdeaBookmark extends BaseSoftDeleteEntity {
  @Column({ nullable: true })
  public is_save: boolean;

  // FK to winnovate_ideas (required)
  @Column({ nullable: false, type: 'int' })
  public winnovate_idea_id: number;

  @ManyToOne(() => WinnovateIdea, (idea) => idea.bookmarks)
  @JoinColumn({ name: 'winnovate_idea_id' })
  public idea: WinnovateIdea;

  // user_id: plain FK column; no relation decorator (user auth TBD)
  @Column({ nullable: false, type: 'int' })
  public user_id: number;
}
