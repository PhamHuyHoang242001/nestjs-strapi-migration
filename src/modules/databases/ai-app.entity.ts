import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { AiAppCategory } from './ai-app-category.entity';
import { AiAppApi } from './ai-app-api.entity';
import { AiAppHistory } from './ai-app-history.entity';
import { UserAiApp } from './user-ai-app.entity';

// AI application entry linked to a category with usage tracking
@Entity('ai_apps')
export class AiApp extends BaseSoftDeleteEntity {
  @Column({ nullable: false })
  public name: string;

  @Column({ type: 'text', nullable: true })
  public short_desc: string;

  // Strapi media field: image stored as flat metadata columns
  @Column({ nullable: true })
  public image_url: string;

  @Column({ nullable: true })
  public image_name: string;

  @Column({ nullable: true })
  public image_mime: string;

  @Column({ nullable: true, type: 'int' })
  public image_size: number;

  @Column({ nullable: false })
  public bu: string;

  @Column({ nullable: true })
  public scope: string;

  @Column({ nullable: false })
  public po: string;

  @Column({ type: 'jsonb', nullable: true })
  public impact: object;

  // Strapi media field: pdf stored as flat metadata columns
  @Column({ nullable: true })
  public pdf_url: string;

  @Column({ nullable: true })
  public pdf_name: string;

  @Column({ nullable: true })
  public pdf_mime: string;

  @Column({ nullable: true, type: 'int' })
  public pdf_size: number;

  @Column({ nullable: true, type: 'int', default: 0 })
  public total_quantity_used: number;

  @Column({ nullable: false })
  public email: string;

  @Column({ nullable: true })
  public ref_key: string;

  // FK to ai_app_categories
  @Column({ nullable: true, type: 'int' })
  public ai_app_category_id: number;

  @ManyToOne(() => AiAppCategory, (c) => c.ai_apps)
  @JoinColumn({ name: 'ai_app_category_id' })
  public ai_app_category: AiAppCategory;

  // 1:N relations
  @OneToMany(() => AiAppApi, (a) => a.ai_app)
  public ai_app_apis: AiAppApi[];

  @OneToMany(() => AiAppHistory, (h) => h.ai_app)
  public ai_app_histories: AiAppHistory[];

  @OneToMany(() => UserAiApp, (u) => u.ai_app)
  public user_ai_apps: UserAiApp[];
}
