import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { DataHubConsumerCategory } from '@modules/databases/data-hub-enums';

const trim = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim() : value);

// Editable consumer fields (code is immutable, so it lives only on the create DTO).
export class UpdateConsumerDto {
  @ApiProperty({ maxLength: 255 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  readonly name: string;

  @ApiProperty({ enum: DataHubConsumerCategory })
  @IsEnum(DataHubConsumerCategory)
  readonly category: DataHubConsumerCategory;

  @ApiProperty()
  @IsInt()
  readonly division_id: number;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsInt()
  readonly department_id?: number | null;

  @ApiProperty({ maxLength: 200 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  readonly short_description: string;

  @ApiProperty({ type: [Number], description: '1-20 distinct user ids' })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  readonly business_contact_user_ids: number[];
}
