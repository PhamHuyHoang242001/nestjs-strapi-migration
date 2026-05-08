import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber } from 'class-validator';

// Body for POST /bi-hub/diagnostic-report/view
export class IncreaseViewDto {
  @ApiProperty({ required: true })
  @IsNotEmpty()
  @IsNumber()
  readonly reportId: number;
}
