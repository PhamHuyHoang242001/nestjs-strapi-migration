import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity } from 'typeorm';

// Top-level category for Winnovate ideas
@Entity('winnovate_categories')
export class WinnovateCategory extends BaseSoftDeleteEntity {
  @Column({ nullable: false })
  public name: string;

  // Strapi media field: image stored as flat metadata columns
  @Column({ nullable: true })
  public image_url: string;

  @Column({ nullable: true })
  public image_name: string;

  @Column({ nullable: true })
  public image_mime: string;

  @Column({ nullable: true, type: 'int' })
  public image_size: number;

  @Column({ nullable: true })
  public is_published: boolean;

  // group_policy_id: FK to GroupPolicy (out-of-scope auth entity — stored as nullable int stub)
  @Column({ nullable: true, type: 'int' })
  public group_policy_id: number;
}
