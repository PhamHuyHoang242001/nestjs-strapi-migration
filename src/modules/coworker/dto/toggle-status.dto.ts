import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { CoworkerPackageStatus } from '@modules/databases/coworker-package.entity';

export class ToggleStatusDto {
  @ApiProperty({ enum: CoworkerPackageStatus })
  @IsEnum(CoworkerPackageStatus)
  readonly status: CoworkerPackageStatus;
}
