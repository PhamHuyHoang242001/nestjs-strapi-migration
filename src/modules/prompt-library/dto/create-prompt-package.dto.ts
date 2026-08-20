import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { AssetHubItemMetaFieldsDto } from '@modules/asset-hub-catalog/dto';

// The prompt artifact is plain text sent inline in the JSON body — NO ZIP, NO Strapi fetch for
// content. The optional avatar is a plain URL (mirroring the diagnostic report's `icon`), whose
// origin is validated against the configured Strapi host at submit. Media ids are never accepted
// from the client (IDOR guard).
//
// Extends the shared asset-hub metadata: publisher_id, responsible_user_ids, usage_guide_html and
// tag_ids travel with the create request, because there is no separate metadata endpoint.
export class CreatePromptPackageDto extends AssetHubItemMetaFieldsDto {
  @ApiProperty({ description: 'Active prompt category ID' })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  readonly category_id: number;
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
}
