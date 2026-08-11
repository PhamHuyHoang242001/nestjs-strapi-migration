import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { SkillCategory } from '../skill-category.constant';
import { SkillFileDto } from './skill-file.dto';

// Pull-based upload: the client uploads the zip (and optional avatar) to Strapi
// first, then sends the resulting Strapi URLs here. The backend fetches file.fileUrl to
// unzip/validate. URLs are validated against the configured Strapi origin at fetch
// time (SSRF guard), so relative or absolute Strapi URLs are both accepted here.
// Media ids remain server-assigned — never accepted from the client (IDOR guard M2).
export class CreateSkillPackageDto {
  // The skill archive as a file object (fileUrl + optional name/type), mirroring the diagnostic
  // report's `file` input. The avatar below is a plain URL (mirroring diagnostic's `icon`).
  @ApiProperty({ description: 'Uploaded skill .zip descriptor', type: SkillFileDto })
  @IsNotEmpty()
  @IsObject()
  @ValidateNested()
  @Type(() => SkillFileDto)
  readonly file: SkillFileDto;

  // Avatar is stored as a plain URL (no metadata row) — only its URL origin is validated at submit.
  @ApiProperty({ description: 'Strapi URL of the uploaded avatar image', required: false, maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  readonly avatar_url?: string;

  @ApiProperty({ description: 'Skill package name', maxLength: 200 })
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

  @ApiProperty({ description: 'Category (closed enum)', enum: SkillCategory })
  @IsNotEmpty()
  @IsEnum(SkillCategory)
  readonly category: SkillCategory;

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
