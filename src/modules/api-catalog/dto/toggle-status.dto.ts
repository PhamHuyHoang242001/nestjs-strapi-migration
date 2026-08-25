import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { ApiPackageStatus } from '@modules/databases/api-catalog-package.entity';

export class ToggleStatusDto {
  @ApiProperty({ enum: ApiPackageStatus, description: 'Target status for the API package' })
  @IsEnum(ApiPackageStatus)
  readonly status: ApiPackageStatus;
}
