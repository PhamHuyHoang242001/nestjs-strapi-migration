import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { AiApp } from './ai-app.entity';

// Join record tracking a user's interaction state with an AI application
@Entity('user_ai_apps')
export class UserAiApp extends BaseSoftDeleteEntity {
  @Column({ nullable: true })
  public is_save_bookmark: boolean;

  @Column({ nullable: true })
  public is_like: boolean;

  // FK to users — placeholder, no relation decorator until auth module ported
  @Column({ nullable: true, type: 'int' })
  public user_id: number;

  // FK to ai_apps
  @Column({ nullable: true, type: 'int' })
  public ai_app_id: number;

  @ManyToOne(() => AiApp, (a) => a.user_ai_apps)
  @JoinColumn({ name: 'ai_app_id' })
  public ai_app: AiApp;
}
