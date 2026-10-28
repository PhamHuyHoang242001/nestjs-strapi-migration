import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim() : value);

// Department (Đơn vị phát hành): code is unique case-insensitively among live rows.
export class DepartmentConfigBodyDto {
  @ApiProperty({ example: 'DPD', maxLength: 100 })
  @Transform(trim)
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,100}$/, { message: 'code must match ^[A-Za-z0-9_-]{1,100}$' })
  readonly code: string;

  @ApiProperty({ maxLength: 255 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  readonly name: string;
}
