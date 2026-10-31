import { ApiProperty, OmitType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsInt, IsOptional, Min } from 'class-validator';
import { CreateDataServiceDto } from '../data-service/dto';
import { LogicalTermBodyDto } from '../dictionary/dto';

// Query strings arrive as text; anything but "false" / "0" keeps the safe default.
const toBool =
  (fallback: boolean) =>
  ({ value }: { value: unknown }): unknown => {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'boolean') return value;
    if (typeof value !== 'string' && typeof value !== 'number') return value;
    const s = String(value).trim().toLowerCase();
    if (s === 'true' || s === '1') return true;
    if (s === 'false' || s === '0') return false;
    return value;
  };

export class ImportQueryDto {
  // true (default) = check only, nothing is written.
  @ApiProperty({ required: false, default: true })
  @Transform(toBool(true))
  @IsOptional()
  @IsBoolean()
  readonly dry_run: boolean = true;
}

export class ImportTemplateQueryDto {
  // true = sample rows filled with real codes and the caller's email, importable as-is.
  @ApiProperty({ required: false, default: false })
  @Transform(toBool(false))
  @IsOptional()
  @IsBoolean()
  readonly example: boolean = false;
}

// What the bulk import validates a service row against: the create body, except that consumers are optional.
// A service may be imported with no App thụ hưởng; POST /data-services keeps requiring 1..20 (CreateDataServiceDto is unchanged).
export class ImportDataServiceDto extends OmitType(CreateDataServiceDto, ['consumer_ids'] as const) {
  @ApiProperty({ required: false, type: [Number] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  readonly consumer_ids?: number[];
}

// What the bulk import validates a row against: the create body without the physical term mapping. A logical term
// imported here starts with no physical terms (the source-table import maps them).
export class LogicalTermImportRowDto extends OmitType(LogicalTermBodyDto, ['physical_term_ids'] as const) {}
