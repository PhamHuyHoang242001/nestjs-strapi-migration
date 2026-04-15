import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { AiApp } from './ai-app.entity';

// Execution history record for an AI application call
@Entity('ai_app_histories')
export class AiAppHistory extends BaseSoftDeleteEntity {
  @Column({ type: 'jsonb', nullable: true })
  public result: object;

  @Column({ type: 'jsonb', nullable: true })
  public body: object;

  @Column({ nullable: true })
  public endpoint: string;

  // FK to users — placeholder, no relation decorator until auth module ported
  @Column({ nullable: true, type: 'int' })
  public user_id: number;

  // FK to ai_apps
  @Column({ nullable: true, type: 'int' })
  public ai_app_id: number;

  @ManyToOne(() => AiApp, (a) => a.ai_app_histories)
  @JoinColumn({ name: 'ai_app_id' })
  public ai_app: AiApp;
}
