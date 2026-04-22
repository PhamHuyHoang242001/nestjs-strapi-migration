import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

export class SearchRecordsDto {
  @ApiPropertyOptional({ description: 'Search keyword (matches id or name column)' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter records created from this date' })
  @IsOptional()
  @IsDateString()
  date_from?: string;

  @ApiPropertyOptional({ description: 'Filter records created up to this date' })
  @IsOptional()
  @IsDateString()
  date_to?: string;
}
