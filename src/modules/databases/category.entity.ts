import { IsBoolean, IsEnum, IsString } from 'class-validator';
import { Column, Entity } from 'typeorm';
import { BaseSoftDeleteEntity } from '@configuration/base-entity';

export enum CategoryType {
  SKILL = 'skill',
  PROMPT = 'prompt',
  API_CATALOG = 'api-catalog',
}

@Entity('ai_hub_categories')
export class Category extends BaseSoftDeleteEntity {
  @Column({ type: 'varchar', length: 200 })
  @IsString()
  public name: string;

  @Column({ type: 'varchar', length: 20 })
  @IsEnum(CategoryType)
  public type: CategoryType;

  @Column({ type: 'boolean', default: true })
  @IsBoolean()
  public is_active: boolean;
}
