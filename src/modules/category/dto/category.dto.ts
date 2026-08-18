import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { CategoryType } from '@modules/databases/category.entity';

export class CategoryTypeQueryDto {
  @ApiProperty({ enum: CategoryType })
  @IsEnum(CategoryType)
  readonly type: CategoryType;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  readonly include_inactive?: boolean = false;
}

export class CreateCategoryDto {
  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MaxLength(200)
  readonly name: string;

  @ApiProperty({ enum: CategoryType })
  @IsEnum(CategoryType)
  readonly type: CategoryType;
}

export class UpdateCategoryDto {
  @ApiProperty({ required: false, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  readonly name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  readonly is_active?: boolean;
}

export class CategoryIdDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  readonly id: number;
}
