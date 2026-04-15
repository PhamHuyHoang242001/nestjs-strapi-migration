import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { AiModel } from './ai-model.entity';

// AI usecase belonging to a specific AI model
@Entity('ai_usecases')
export class AiUsecase extends BaseSoftDeleteEntity {
  @Column({ nullable: false })
  public name: string;

  @Column({ nullable: true })
  public scope: string;

  @Column({ nullable: true })
  public po: string;

  // Strapi media field: icon stored as flat metadata columns
  @Column({ nullable: true })
  public icon_url: string;

  @Column({ nullable: true })
  public icon_name: string;

  @Column({ nullable: true })
  public icon_mime: string;

  @Column({ nullable: true, type: 'int' })
  public icon_size: number;

  @Column({ nullable: true })
  public html_url: string;

  @Column({ nullable: true })
  public bu: string;

  // Strapi media field: pdf stored as flat metadata columns
  @Column({ nullable: true })
  public pdf_url: string;

  @Column({ nullable: true })
  public pdf_name: string;

  @Column({ nullable: true })
  public pdf_mime: string;

  @Column({ nullable: true, type: 'int' })
  public pdf_size: number;

  @Column({ type: 'jsonb', nullable: true })
  public impact: object;

  @Column({ nullable: true })
  public usecase_status: string;

  // FK to ai_models
  @Column({ nullable: true, type: 'int' })
  public ai_model_id: number;

  @ManyToOne(() => AiModel, (m) => m.ai_usecases)
  @JoinColumn({ name: 'ai_model_id' })
  public ai_model: AiModel;
}
