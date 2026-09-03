import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsObject, IsInt, IsOptional, IsString, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { AssetHubItemMetaFieldsDto } from '@modules/asset-hub-catalog/dto';
import { SkillFileDto } from './skill-file.dto';

// Pull-based upload: the client uploads the zip (and optional avatar) to Strapi
// first, then sends the resulting Strapi URLs here. The backend fetches file.fileUrl to
// unzip/validate. URLs are validated against the configured Strapi origin at fetch
// time (SSRF guard), so relative or absolute Strapi URLs are both accepted here.
// Media ids remain server-assigned — never accepted from the client (IDOR guard M2).
//
// Extends the shared asset-hub metadata: publisher_id, responsible_user_ids, owning_unit_name, usage_guide_html and
// tag_ids travel with the create request, because there is no separate metadata endpoint.
export class CreateSkillPackageDto extends AssetHubItemMetaFieldsDto {
  @ApiProperty({ description: 'Active skill category ID' })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  readonly category_id: number;
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
}
