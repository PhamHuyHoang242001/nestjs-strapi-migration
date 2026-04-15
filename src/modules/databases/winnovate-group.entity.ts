import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity } from 'typeorm';

// Group grouping for Winnovate ideas, nested under a category
@Entity('winnovate_groups')
export class WinnovateGroup extends BaseSoftDeleteEntity {
  @Column({ nullable: true })
  public name: string;

  @Column({ nullable: true })
  public color: string;

  // Strapi media field: icon stored as flat metadata columns
  @Column({ nullable: true })
  public icon_url: string;

  @Column({ nullable: true })
  public icon_name: string;

  @Column({ nullable: true })
  public icon_mime: string;

  @Column({ nullable: true, type: 'int' })
  public icon_size: number;

  @Column({ nullable: true, type: 'int' })
  public priority: number;

  @Column({ nullable: true })
  public is_published: boolean;

  // FK to winnovate_categories
  @Column({ nullable: true, type: 'int' })
  public category_id: number;
}
