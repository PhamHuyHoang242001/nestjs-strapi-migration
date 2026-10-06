import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class PreviewZipFileQueryDto {
  @ApiProperty({ required: false, description: 'Full path inside the zip (zip_tree.path)' })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  readonly file?: string;
}
