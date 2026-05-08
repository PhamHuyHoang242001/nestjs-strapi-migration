import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsNumberString } from 'class-validator';

// Query params for GET /bi-hub/diagnostic-report/updated-user
export class SearchUpdatedUserDto {
  @ApiProperty({ required: true })
  @IsNumberString()
  readonly reportId: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  readonly keyword?: string;

  @ApiProperty({ required: false, description: 'created_at only' })
  @IsOptional()
  @IsString()
  readonly sortField?: string;

  @ApiProperty({ required: false, description: 'ASC | DESC' })
  @IsOptional()
  @IsString()
  readonly sortValue?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumberString()
  readonly page?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumberString()
  readonly limit?: string;
}
