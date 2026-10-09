import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export const VERSION_STATE_FILTERS = ['pending', 'approved', 'rejected', 'all'] as const;
export type VersionStateFilter = (typeof VERSION_STATE_FILTERS)[number];

export class ListVersionsDto {
  @ApiProperty({ required: false, type: String })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    const arr = Array.isArray(value) ? value : String(value).split(',');
    return arr.map((c: string | number) => Number(String(c).trim()));
  })
  readonly coworker_package_id?: number[];

  @ApiProperty({ required: false, enum: VERSION_STATE_FILTERS, default: 'all' })
  @IsOptional()
  @IsIn(VERSION_STATE_FILTERS as unknown as string[])
  readonly state?: VersionStateFilter = 'all';

  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === '' ? 1 : Number(value)))
  @IsInt()
  @Min(1)
  readonly page?: number = 1;

  @ApiProperty({ required: false, default: 20 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === '' ? 20 : Number(value)))
  @IsInt()
  @Min(1)
  @Max(100)
  readonly pageSize?: number = 20;

  @ApiProperty({ required: false, enum: ['newest', 'oldest'], default: 'newest' })
  @IsOptional()
  @IsIn(['newest', 'oldest'])
  readonly sort?: 'newest' | 'oldest' = 'newest';

  @ApiProperty({ required: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  readonly codesOnly?: boolean = false;
}
