import { Trim, TrimSpace } from '@common/decorators';
import { EMAIL_INVALID } from '@constant/error-messages';
import { MAX_STR_LENGTH, MAX_TEXT_LENGTH, MIN_STR_LENGTH, REGEX_EMAIL } from '@constant/validation';
import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class IdRefDto {
  @ApiProperty({ required: true })
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  @Transform((u) => u.value || undefined)
  readonly id: number;
}

export class RoleRefDto {
  @ApiProperty({ required: true })
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  @Transform((u) => u.value || undefined)
  role_id: number;
}
export class RoleRefOptionalDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Transform((u) => u.value || undefined)
  readonly role_id: number;
}

export class SearchDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  readonly search?: string;
}

export class UserRefDto {
  @ApiProperty({ required: false })
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  @Transform((u) => u.value || undefined)
  readonly user_id: number;
}
export class UserRefOptionalDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Transform((u) => u.value || undefined)
  readonly user_id: number;
}

export class NameDto {
  @ApiProperty({ required: true })
  @IsString()
  @Trim()
  @MinLength(MIN_STR_LENGTH)
  @MaxLength(MAX_STR_LENGTH)
  @IsNotEmpty()
  name: string;
}

export class DesciptionOptionalDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(MIN_STR_LENGTH)
  @MaxLength(MAX_TEXT_LENGTH)
  description: string;
}

export class EmailDto {
  @ApiProperty({ required: true, description: 'email', example: 'ducnd@gmail.com' })
  @IsEmail()
  @Matches(RegExp(REGEX_EMAIL, 'g'), { message: EMAIL_INVALID })
  @TrimSpace()
  @IsNotEmpty()
  email: string;
}

export class EmailOptionalDto {
  @ApiProperty({ required: true, description: 'email', example: 'ducnd@gmail.com' })
  @IsEmail()
  @Matches(RegExp(REGEX_EMAIL, 'g'), { message: EMAIL_INVALID })
  @TrimSpace()
  @IsOptional()
  email: string;
}


export class BaseSearchDto {
  @ApiProperty({ required: false })
  @Type(() => String)
  @IsString()
  @IsOptional()
  @Trim()
  @Transform((u) => (u.value ? u.value.replace(/[&\/\\#,+()$~%'":*?<>{}]/g, '') : u.value))
  @MaxLength(250)
  keyword?: string;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  limit?: number = 10;

  @ApiProperty({ required: false })
  @IsOptional()
  sort: object = { created_at: 'DESC' };
}
