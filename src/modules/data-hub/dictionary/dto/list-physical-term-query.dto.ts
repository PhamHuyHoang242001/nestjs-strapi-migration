import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';
import { DataHubPageQueryDto } from '../../common/data-hub-query.util';

const toOptionalNumber = ({ value }: { value: unknown }): unknown =>
  value === '' || value === undefined ? undefined : Number(value);

// Picker for the logical create/edit form: logical_term_id keeps the physicals already attached selectable.
export class ListAvailablePhysicalTermQueryDto extends DataHubPageQueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsInt()
  @Min(1)
  readonly logical_term_id?: number;
}
