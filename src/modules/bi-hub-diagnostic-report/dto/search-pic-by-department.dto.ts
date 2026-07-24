import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsNumberString } from 'class-validator';

// Query params for GET /bi-hub/diagnostic-report/pic-users/by-department
// Returns distinct users who are PIC of any non-deleted diagnostic report
// within the given BICC department.
export class SearchPicByDepartmentDto {
  @ApiProperty({ required: true, description: 'BICC department ID' })
  @IsNumberString()
  readonly biccDepartmentId: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumberString()
  readonly page?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumberString()
  readonly limit?: string;
}
