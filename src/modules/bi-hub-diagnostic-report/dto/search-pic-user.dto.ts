import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsNumberString, MaxLength } from 'class-validator';

// Query params for GET /bi-hub/diagnostic-report/pic-users
// Keyword-only user search: empty keyword returns an empty page (no query run).
export class SearchPicUserDto {
  @ApiProperty({ required: false, description: 'Match against user email; empty returns []' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  readonly keyword?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumberString()
  readonly page?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumberString()
  readonly limit?: string;
}
