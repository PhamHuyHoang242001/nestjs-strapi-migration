import { GENDER } from '@common/enums';
import { ApiProperty, OmitType } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class UserProfileDto {
  @ApiProperty()
  @IsOptional()
  @IsInt()
  public id?: number;

  @ApiProperty()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  public first_name?: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  public last_name?: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  public email?: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  @MaxLength(12)
  public phone?: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  public phone_code?: string;

  @ApiProperty()
  @IsOptional()
  @IsDateString()
  public date_of_birth?: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  public country: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  public country_iso?: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  public phone_iso?: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  public state?: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  public state_iso?: string;

  @ApiProperty()
  @IsOptional()
  @IsEnum(GENDER)
  public gender?: GENDER;

  @ApiProperty()
  @IsOptional()
  @IsBoolean()
  public social_link?: boolean;
}

export class UpdateMyProfileDto extends OmitType(UserProfileDto, ['id', 'social_link', 'country', 'state'] as const) {}
