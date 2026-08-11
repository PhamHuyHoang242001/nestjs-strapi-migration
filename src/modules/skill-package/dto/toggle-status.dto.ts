import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { SkillPackageStatus } from '@modules/databases/skill-package.entity';

export class ToggleStatusDto {
  @ApiProperty({ enum: SkillPackageStatus, description: 'Target status for the skill package' })
  @IsEnum(SkillPackageStatus)
  readonly status: SkillPackageStatus;
}
