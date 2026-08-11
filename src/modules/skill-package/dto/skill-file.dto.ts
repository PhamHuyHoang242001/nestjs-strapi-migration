import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

// Uploaded-file descriptor for a skill version, shaped like the diagnostic report's file input
// (DiagnosticFileDto): the client uploads to Strapi first, then sends the resulting URL plus
// optional display metadata here. Only fileUrl is required — the backend still downloads the zip
// to unzip/validate and measures size/mime itself (authoritative); name falls back to the parsed
// filename when omitted. Currently the file is always the skill .zip.
export class SkillFileDto {
  @ApiProperty({ description: 'Strapi URL of the uploaded skill .zip', maxLength: 2000 })
  @IsNotEmpty()
  @IsString()
  @MaxLength(2000)
  readonly fileUrl: string;

  @ApiProperty({ description: 'Original filename (display only; server re-parses)', required: false, maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  readonly name?: string;

  @ApiProperty({ description: 'File type hint (display only; always a zip today)', required: false, maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  readonly type?: string;
}
