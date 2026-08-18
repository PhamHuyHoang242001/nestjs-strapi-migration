import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { SkillCategory } from '../skill-category.constant';
import { SkillFileDto } from './skill-file.dto';

// DTO for creating a new version of an existing skill package.
// Pull-based upload: client uploads to Strapi first, sends the URLs here; the
// backend fetches file.fileUrl to unzip/validate. Media ids stay server-assigned (M2).
export class CreateSkillVersionDto {
  @ApiProperty({ description: 'Active skill category ID', required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  readonly category_id?: number;
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

  @ApiProperty({ description: 'Category (closed enum)', enum: SkillCategory })
  @IsOptional()
  @IsEnum(SkillCategory)
  readonly category: SkillCategory;

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
