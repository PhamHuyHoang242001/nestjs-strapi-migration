import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, OneToMany } from 'typeorm';
import { AiApp } from './ai-app.entity';

// Category grouping for AI applications
@Entity('ai_app_categories')
export class AiAppCategory extends BaseSoftDeleteEntity {
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

  // 1:N → ai_apps.ai_app_category_id
  @OneToMany(() => AiApp, (a) => a.ai_app_category)
  public ai_apps: AiApp[];
}
