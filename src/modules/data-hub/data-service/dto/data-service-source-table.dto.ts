import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { trimString } from './data-service-dto-transforms';

// One physical term of the service. `id` = an existing term of this service (edit / move), absent = new term.
export class DataServiceTermInputDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  readonly id?: number;

  @ApiProperty({ maxLength: 255, description: 'Unique inside its source table (case-insensitive)' })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  readonly code: string;

  @ApiProperty({ maxLength: 2000 })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  readonly technical_description: string;

  @ApiProperty({ required: false, nullable: true, maxLength: 1000 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(1000)
  readonly example_value?: string | null;

  // Logical term (Thuật ngữ chuẩn hoá) the term is mapped to; null = unmapped, absent = keep the current mapping.
  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  readonly logical_term_id?: number | null;
}

// A source table (Bảng nguồn dịch vụ) used by the service with the service's terms in it.
// `id` = an existing table (its name/description are updated from this body), absent = new table.
export class DataServiceSourceTableInputDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  readonly id?: number;

  @ApiProperty({ maxLength: 255, description: 'Unique system-wide (case-insensitive)' })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  readonly name: string;

  @ApiProperty({ required: false, nullable: true, maxLength: 2000 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(2000)
  readonly description?: string | null;

  // At least one term: an empty group would keep a table nobody can see in the grouped lists.
  @ApiProperty({ type: [DataServiceTermInputDto], minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => DataServiceTermInputDto)
  readonly terms: DataServiceTermInputDto[];
}
