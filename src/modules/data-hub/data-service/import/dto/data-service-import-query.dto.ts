import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

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

export class DataServiceImportQueryDto {
  // true (default) = check only, nothing is written.
  @ApiProperty({ required: false, default: true })
  @Transform(toBool(true))
  @IsOptional()
  @IsBoolean()
  readonly dry_run: boolean = true;
}

export class DataServiceImportTemplateQueryDto {
  // true = sample rows filled with real codes and the caller's email, importable as-is.
  @ApiProperty({ required: false, default: false })
  @Transform(toBool(false))
  @IsOptional()
  @IsBoolean()
  readonly example: boolean = false;
}
