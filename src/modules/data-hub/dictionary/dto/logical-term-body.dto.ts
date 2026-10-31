import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim() : value);

// Create/replace body of a logical term; physical_term_ids is the full desired mapping.
export class LogicalTermBodyDto {
  @ApiProperty({ maxLength: 255 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  readonly code: string;

  @ApiProperty({ maxLength: 400 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(400)
  readonly short_description: string;

  @ApiProperty({ required: false, nullable: true, maxLength: 1000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  readonly example_value?: string | null;

  // May be empty or omitted (= []): a logical term can exist before any physical term is mapped to it. On update,
  // [] detaches every physical term of active services.
  @ApiProperty({ type: [Number], required: false, default: [] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  readonly physical_term_ids: number[] = [];
}
