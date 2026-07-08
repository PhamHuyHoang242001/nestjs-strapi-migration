import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

// Search category — keyword + filter by ids (comma-separated string → int[]).
export class SearchBiPaymentCategoryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  readonly keyword?: string;

  @ApiProperty({ required: false, description: 'Comma-separated ids' })
  @IsOptional()
  @IsString()
  readonly ids?: string;
}
