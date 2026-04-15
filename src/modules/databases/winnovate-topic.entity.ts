import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity } from 'typeorm';

// Topic classification for Winnovate ideas, nested under a category
@Entity('winnovate_topics')
export class WinnovateTopic extends BaseSoftDeleteEntity {
  @Column({ nullable: true })
  public name: string;

  @Column({ nullable: true })
  public color: string;

  @Column({ nullable: true })
  public is_published: boolean;

  // FK to winnovate_categories
  @Column({ nullable: true, type: 'int' })
  public category_id: number;
}
