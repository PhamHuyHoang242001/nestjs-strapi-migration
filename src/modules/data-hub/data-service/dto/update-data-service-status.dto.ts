import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { DataHubStatus } from '@modules/databases/data-hub-enums';

export class UpdateDataServiceStatusDto {
  @ApiProperty({ enum: DataHubStatus })
  @IsEnum(DataHubStatus)
  readonly status: DataHubStatus;
}
