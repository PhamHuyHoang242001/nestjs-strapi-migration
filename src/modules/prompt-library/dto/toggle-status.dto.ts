import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { PromptPackageStatus } from '@modules/databases/prompt-package.entity';

export class ToggleStatusDto {
  @ApiProperty({ enum: PromptPackageStatus, description: 'Target status for the prompt package' })
  @IsEnum(PromptPackageStatus)
  readonly status: PromptPackageStatus;
}
