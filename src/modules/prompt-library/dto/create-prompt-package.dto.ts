import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PromptCategory } from '../prompt-category.constant';

// The prompt artifact is plain text sent inline in the JSON body — NO ZIP, NO Strapi fetch for
// content. The optional avatar is a plain URL (mirroring the diagnostic report's `icon`), whose
// origin is validated against the configured Strapi host at submit. Media ids are never accepted
// from the client (IDOR guard).
export class CreatePromptPackageDto {
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

  @ApiProperty({ description: 'Prompt package name', maxLength: 200 })
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
  @IsNotEmpty()
  @IsEnum(PromptCategory)
  readonly category: PromptCategory;

  @ApiProperty({ description: 'Freeform tags array', type: [String], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => {
    if (!Array.isArray(value)) return [];
    // Cap each tag at 100 chars and allow at most 20 tags to bound storage.
    return (value as string[]).slice(0, 20).map((t) => String(t).substring(0, 100));
  })
  readonly tags?: string[];
}
