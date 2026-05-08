import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

// Query params for DELETE /admin/diagnostic/report
export class DeleteManyDiagnosticReportDto {
  @ApiProperty({ required: true, description: 'Comma-separated report IDs' })
  @IsNotEmpty()
  @IsString()
  readonly ids: string;
}
