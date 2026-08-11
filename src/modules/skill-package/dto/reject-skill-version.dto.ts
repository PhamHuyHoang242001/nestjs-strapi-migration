import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

// Rejection reason is REQUIRED — approvers must provide a human-readable explanation.
// An empty reason is rejected at the validation layer (400) before reaching the service.
export class RejectSkillVersionDto {
  @ApiProperty({ description: 'Rejection reason (required)', maxLength: 2000 })
  @IsNotEmpty({ message: 'Rejection reason is required' })
  @IsString()
  @MaxLength(2000)
  readonly reason: string;
}
