import { AiModelType } from '@common/enums/ai.enums';
import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, OneToMany } from 'typeorm';
import { AiUsecase } from './ai-usecase.entity';

// AI model registry — each model can have multiple usecases
@Entity('ai_models')
export class AiModel extends BaseSoftDeleteEntity {
  @Column({ nullable: false })
  public name: string;

  @Column({ type: 'text', nullable: false })
  public impact: string;

  @Column({ type: 'text', nullable: false })
  public purpose: string;

  // Strapi media field: cover stored as flat metadata columns
  @Column({ nullable: true })
  public cover_url: string;

  @Column({ nullable: true })
  public cover_name: string;

  @Column({ nullable: true })
  public cover_mime: string;

  @Column({ nullable: true, type: 'int' })
  public cover_size: number;

  @Column({ type: 'enum', enum: AiModelType, nullable: true })
  public type: AiModelType;

  @Column({ nullable: true })
  public is_published: boolean;

  // 1:N → ai_usecases.ai_model_id
  @OneToMany(() => AiUsecase, (u) => u.ai_model)
  public ai_usecases: AiUsecase[];
}
