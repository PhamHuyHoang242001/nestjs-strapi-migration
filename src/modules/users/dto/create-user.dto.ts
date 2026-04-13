import { TrimSpace } from '@common/decorators';
import { EmailDto, RoleRefDto } from '@common/dto/common.dto';
import { NameDto, PhoneDto } from '@modules/auth/dto';
import { ApiHideProperty, ApiProperty, IntersectionType } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateUserDto extends IntersectionType(NameDto, PhoneDto, EmailDto, RoleRefDto) {
  @ApiProperty({ required: false })
  @TrimSpace()
  @IsString()
  @IsOptional()
  code: string;

  @ApiHideProperty()
  @IsOptional()
  @IsBoolean()
  allow_duplicate_area: boolean;
}
