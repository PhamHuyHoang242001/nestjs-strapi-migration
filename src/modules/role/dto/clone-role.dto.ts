import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, MaxLength } from 'class-validator';
import { Trim } from '@common/decorators/transforms.decorator';

export class CloneRoleDto {
  @ApiProperty({ required: true })
  @IsNotEmpty()
  @IsString()
  @Trim()
  @MaxLength(255)
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  code: string;
}
