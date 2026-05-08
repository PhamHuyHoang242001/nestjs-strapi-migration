import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsString, IsNumber, IsBoolean, IsOptional, IsArray, ValidateNested, MaxLength } from 'class-validator';

// Nested DTO for diagnostic file payload
export class DiagnosticFileDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  readonly fileUrl?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  readonly name?: string;

  @ApiProperty({ required: false, description: 'POWER_BI | SUPERSET | FILE' })
  @IsOptional()
  @IsString()
  readonly type?: string;
}

// Body for POST /admin/diagnostic/report — matches Strapi FE payload
export class CreateDiagnosticReportDto {
  @ApiProperty({ required: true })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  readonly name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  readonly summary?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  readonly insight?: Record<string, any>;

  @ApiProperty({ required: true })
  @IsNotEmpty()
  @IsString()
  readonly icon: string;

  @ApiProperty({ required: true })
  @IsNotEmpty()
  @IsBoolean()
  readonly isSensitive: boolean;

  @ApiProperty({ required: true, description: 'BICC department ID' })
  @IsNotEmpty()
  @IsNumber()
  readonly biccDepartment: number;

  @ApiProperty({ required: false, type: DiagnosticFileDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DiagnosticFileDto)
  readonly file?: DiagnosticFileDto;

  @ApiProperty({ required: true })
  @IsNotEmpty()
  @IsNumber()
  readonly department: number;

  @ApiProperty({ required: true })
  @IsNotEmpty()
  @IsNumber()
  readonly center: number;

  @ApiProperty({ required: true })
  @IsNotEmpty()
  @IsNumber()
  readonly division: number;

  @ApiProperty({ required: false, description: 'Diagnostic scope text' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  readonly scopes?: string;

  @ApiProperty({ required: false, type: [Number], description: 'Label IDs' })
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  readonly labels?: number[];
}
