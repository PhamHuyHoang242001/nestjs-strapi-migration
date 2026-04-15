import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { AiApp } from './ai-app.entity';

// API endpoint configuration for an AI application
@Entity('ai_app_apis')
export class AiAppApi extends BaseSoftDeleteEntity {
  @Column({ nullable: false })
  public name: string;

  @Column({ nullable: false })
  public endpoint: string;

  @Column({ nullable: true })
  public method: string;

  @Column({ type: 'jsonb', nullable: true })
  public form_data: object;

  @Column({ nullable: true })
  public token_key: string;

  @Column({ nullable: true })
  public token_value: string;

  @Column({ nullable: true })
  public token_expired_at: Date;

  @Column({ type: 'text', nullable: true })
  public short_desc: string;

  // FK to ai_apps
  @Column({ nullable: true, type: 'int' })
  public ai_app_id: number;

  @ManyToOne(() => AiApp, (a) => a.ai_app_apis)
  @JoinColumn({ name: 'ai_app_id' })
  public ai_app: AiApp;
}
