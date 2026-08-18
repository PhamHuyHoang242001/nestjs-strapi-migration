import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PromptCategory } from '../prompt-category.constant';

// DTO for creating a new version of an existing prompt package.
// Prompt text is sent inline (no ZIP, no Strapi fetch for content). Media ids stay server-assigned.
export class CreatePromptVersionDto {
  @ApiProperty({ description: 'Active prompt category ID', required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  readonly category_id?: number;
  // The prompt text — the reviewable/diffable artifact. Capped at 50k chars to bound storage.
  @ApiProperty({ description: 'Prompt text content', maxLength: 50000 })
  @IsNotEmpty()
  @IsString()
  @MaxLength(50000)
  readonly prompt_content: string;

  // Avatar is stored as a plain URL (no metadata row) — only its URL origin is validated at submit.
  @ApiProperty({ description: 'Strapi URL of the uploaded avatar image', required: false, maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  readonly avatar_url?: string;

  @ApiProperty({ description: 'Version name', maxLength: 200 })
  @IsNotEmpty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  readonly name: string;

  @ApiProperty({ description: 'Short description', maxLength: 1000 })
  @IsNotEmpty()
  @IsString()
  @MaxLength(1000)
  readonly short_description: string;

  @ApiProperty({ description: 'Category (closed enum)', enum: PromptCategory })
  @IsOptional()
  @IsEnum(PromptCategory)
  readonly category: PromptCategory;

  @ApiProperty({ description: 'Tags array', type: [String], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => {
    if (!Array.isArray(value)) return [];
    return (value as string[]).slice(0, 20).map((t) => String(t).substring(0, 100));
  })
  readonly tags?: string[];

  @ApiProperty({ description: 'Changelog note for this version', required: false, maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  readonly changelog_note?: string;
}
