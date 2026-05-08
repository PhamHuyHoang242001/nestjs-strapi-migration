import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SearchBiccDepartmentDto {
  @ApiProperty({ required: false, description: 'Search by name or code' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  readonly keyword?: string;
}
