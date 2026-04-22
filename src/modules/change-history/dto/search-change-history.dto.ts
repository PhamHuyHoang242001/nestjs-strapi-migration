import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SearchChangeHistoryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  entity_type?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  action_type?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  performed_by?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  date_from?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  date_to?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  search?: string;
}
