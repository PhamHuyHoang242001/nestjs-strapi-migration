import { IsBoolean, IsEnum, IsString } from 'class-validator';
import { Column, Entity } from 'typeorm';
import { BaseColumn } from '@configuration/base-entity';

export enum CategoryType {
  SKILL = 'skill',
  PROMPT = 'prompt',
}

@Entity('categories')
export class Category extends BaseColumn {
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
