import {
  IsBoolean,
  IsEmail,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsNumberString,
  IsOptional,
  IsPhoneNumber,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  IsEnum,
} from 'class-validator';

import { ToLowerCase, Trim, TrimSpace } from '@common/decorators/transforms.decorator';
import {
  ACCOUNT_NUMBER_INVALID,
  MODEL_AUTH_OLD_PASSWORD_INVALID,
  MODEL_AUTH_PASSWORD_INVALID,
  PHONE_NUMBER_INVALID,
  USERNAME_EMAIL_INVALID,
  USERNAME_INVALID,
} from '@constant/error-messages';
import {
  MAX_EMAIL_LENGTH,
  MAX_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH_ADMIN,
  MAX_PHONE_LENGTH,
  MAX_STR_LENGTH,
  MAX_TEXT_LENGTH,
  MIN_EMAIL_LENGTH,
  MIN_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH_ADMIN,
  MIN_PHONE_CODE_LENGTH,
  MIN_PHONE_LENGTH,
  MIN_STR_LENGTH,
  REGEX_ACCOUNT_NUMBER,
  REGEX_EMAIL,
  REGEX_PASSWORD,
  REGEX_PHONE,
  REGEX_PRE_PHONE,
} from '@constant/validation';
import { ApiHideProperty, ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { GENDER } from '@common/enums';
import { ERROR_CODE } from '@constant/error-code';

export class CommonUsernameDto {
  @ApiProperty({ required: true })
  @TrimSpace()
  @IsString()
  @MinLength(MIN_STR_LENGTH)
  @MaxLength(MAX_STR_LENGTH)
  @IsNotEmpty()
  username: string;
}

export class EmailDto {
  @ApiProperty({ required: true, description: 'email', example: 'usertest@gmail.com' })
  @Matches(RegExp(REGEX_EMAIL, 'g'), { message: ERROR_CODE.A008 })
  @Trim()
  @IsEmail()
  @IsNotEmpty()
  @ToLowerCase()
  email: string;
}

export class FirstnameDto {
  @ApiProperty({ required: true, example: 'vucong', description: 'firstname' })
  @Trim()
  @MinLength(1, { message: USERNAME_INVALID })
  @MaxLength(50, { message: USERNAME_INVALID })
  @IsNotEmpty()
  @Type(() => String)
  @IsString()
  first_name: string;
}

export class LastnameDto {
  @ApiProperty({ required: true, example: 'vucong', description: 'lastname' })
  @Trim()
  @MinLength(1, { message: USERNAME_INVALID })
  @MaxLength(50, { message: USERNAME_INVALID })
  @IsNotEmpty()
  @Type(() => String)
  @IsString()
  last_name: string;
}

export class UsernameDto {
  @ApiProperty({ required: true, example: '0987654321', description: 'username' })
  @TrimSpace()
  @IsString()
  @Matches(RegExp(REGEX_PHONE, 'g'), { message: PHONE_NUMBER_INVALID })
  @IsPhoneNumber('VN')
  @Transform((u) => (u.value ? u.value.replace(new RegExp(REGEX_PRE_PHONE, 'gm'), '') : u.value))
  @MinLength(MIN_PHONE_LENGTH, { message: PHONE_NUMBER_INVALID })
  @MaxLength(MAX_PHONE_LENGTH, { message: PHONE_NUMBER_INVALID })
  @IsNotEmpty()
  username: string;
}

export class CountryDto {
  @ApiProperty({ required: true, example: 'VN', description: 'country' })
  @Trim()
  @IsString()
  @IsOptional()
  country_iso: string;
}

export class PhoneISODto {
  @ApiProperty({ required: true, example: 'VN', description: 'country' })
  @Trim()
  @IsString()
  @IsOptional()
  phone_iso: string;
}

export class StateDto {
  @ApiProperty({ required: true, example: '', description: 'state' })
  @Trim()
  @IsString()
  @IsOptional()
  state_iso: string;
}

export class GenderDto {
  @ApiProperty({ required: true, example: '', description: 'gender' })
  @IsEnum(GENDER)
  @IsOptional()
  gender: GENDER;
}


export class DateOfBirthDto {
  @ApiProperty({ required: true, example: '', description: 'date of birth' })
  @IsDateString()
  @IsOptional()
  date_of_birth: Date;
}

export class PasswordDto {
  @ApiProperty({ required: true, example: 'password', description: 'password' })
  @IsString()
  @Trim()
  @Matches(RegExp(REGEX_PASSWORD, 'g'), { message: ERROR_CODE.A007 })
  @MinLength(MIN_PASSWORD_LENGTH)
  @MaxLength(MAX_PASSWORD_LENGTH)
  @IsNotEmpty()
  password: string;
}
export class ConfirmPasswordDto {
  @ApiProperty({ description: 'confirm_password' })
  @IsString()
  @Trim()
  @Matches(RegExp(REGEX_PASSWORD, 'g'), { message: ERROR_CODE.A007 })
  @MinLength(MIN_PASSWORD_LENGTH)
  @MaxLength(MAX_PASSWORD_LENGTH)
  @IsNotEmpty()
  confirm_password: string;
}

export class OldPasswordDto {
  @ApiProperty({ description: 'old_password' })
  @IsString()
  @Trim()
  @Matches(RegExp(REGEX_PASSWORD, 'g'), { message: MODEL_AUTH_OLD_PASSWORD_INVALID })
  @MinLength(MIN_STR_LENGTH)
  @MaxLength(MAX_PASSWORD_LENGTH)
  @IsNotEmpty()
  old_password: string;
}

/**
 * admin
 * =====================================================
 * =====================================================
 * =====================================================
 */

export class AdminUsernameDto {
  @ApiProperty({ required: true, description: 'email', example: 'usertest@gmail.com' })
  @Matches(RegExp(REGEX_EMAIL, 'g'), { message: USERNAME_EMAIL_INVALID })
  @TrimSpace()
  @MinLength(MIN_EMAIL_LENGTH)
  @MaxLength(MAX_EMAIL_LENGTH)
  @IsEmail()
  @IsNotEmpty()
  username: string;
}
export class AdminPasswordDto {
  @ApiProperty({ required: true, example: 'password', description: 'password' })
  @IsString()
  @TrimSpace()
  @Matches(RegExp(REGEX_PASSWORD, 'g'), { message: MODEL_AUTH_PASSWORD_INVALID })
  @MinLength(MIN_PASSWORD_LENGTH_ADMIN)
  @MaxLength(MAX_PASSWORD_LENGTH_ADMIN)
  @IsNotEmpty()
  password: string;
}
export class AdminConfirmPasswordDto {
  @ApiProperty({ description: 'confirm_password' })
  @IsString()
  @TrimSpace()
  @Matches(RegExp(REGEX_PASSWORD, 'g'), { message: MODEL_AUTH_PASSWORD_INVALID })
  @MinLength(MIN_PASSWORD_LENGTH_ADMIN)
  @MaxLength(MAX_PASSWORD_LENGTH_ADMIN)
  @IsNotEmpty()
  confirm_password: string;
}

export class AdminOldPasswordDto {
  @ApiProperty({ description: 'confirm_password' })
  @IsString()
  @TrimSpace()
  @Matches(RegExp(REGEX_PASSWORD, 'g'), { message: MODEL_AUTH_OLD_PASSWORD_INVALID })
  @MinLength(MIN_PASSWORD_LENGTH_ADMIN)
  @MaxLength(MAX_PASSWORD_LENGTH_ADMIN)
  @IsNotEmpty()
  old_password: string;
}

export class PhoneDto {
  @ApiProperty({ required: true, example: '987654321', description: 'phone' })
  @TrimSpace()
  @IsString()
  @MinLength(MIN_PHONE_LENGTH)
  @MaxLength(MAX_PHONE_LENGTH)
  @IsOptional()
  phone: string;
}

export class PhoneCodeDto {
  @ApiProperty({ required: true, example: '+84', description: 'phone code' })
  @TrimSpace()
  @IsString()
  @MinLength(MIN_PHONE_CODE_LENGTH)
  @MaxLength(MAX_PHONE_LENGTH)
  @IsOptional()
  phone_code: string;
}

export class TownCityDto {
  @ApiProperty({ required: true, example: '', description: 'Town city' })
  @IsString()
  @Trim()
  @IsNotEmpty()
  town_city: string;
}

export class ZipCodeDto {
  @ApiProperty({ required: true, example: '', description: 'Zip code' })
  @IsString()
  @Trim()
  @IsNotEmpty()
  zip_code: string;
}

export class CardIdDto {
  @ApiProperty({ required: true, example: '0987654321' })
  @TrimSpace()
  @IsString()
  @IsNumberString()
  @MinLength(9)
  @MaxLength(12)
  @IsNotEmpty()
  card_id: string;
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

export class IsLogoutDto {
  @ApiHideProperty()
  logout: boolean = true;
}

export class BankInfo {
  @ApiProperty({ required: true, example: 1 })
  @IsNumber()
  @IsNotEmpty()
  @Type(() => Number)
  public bank_id: number;

  @ApiProperty({ required: true, example: '0987654321' })
  @Matches(RegExp(REGEX_ACCOUNT_NUMBER, 'g'), { message: ACCOUNT_NUMBER_INVALID })
  @MinLength(1)
  @MaxLength(20)
  @IsNotEmpty()
  public account_number: string;

  @ApiProperty({ required: true, example: 'NGUYEN VAN A' })
  @IsString()
  @MaxLength(255)
  @IsNotEmpty()
  public account_name: string;
}

export class CommonInfoUser {
  @ApiProperty({ required: true, example: 'Nguyễn Văn A' })
  @Trim()
  @IsString()
  @MaxLength(MAX_STR_LENGTH)
  @IsNotEmpty()
  name: string;

  @ApiProperty({ required: true, example: 1 })
  @IsNumber()
  @IsNotEmpty()
  province_id: number;

  @ApiProperty({ required: true, example: 1 })
  @IsNumber()
  @IsNotEmpty()
  district_id: number;

  @ApiProperty({ required: true, example: 1 })
  @IsNumber()
  @IsNotEmpty()
  ward_id: number;

  @ApiProperty({ required: false, example: '18 nguyen van cu' })
  @Trim()
  @IsString()
  @MaxLength(MAX_TEXT_LENGTH)
  @IsNotEmpty()
  address: string;
}

export class IdUuidDto {
  @ApiProperty({ required: true })
  @IsNotEmpty()
  @IsString()
  id: string;
}

export class RememberMeDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  remember_me: boolean = false;
}
