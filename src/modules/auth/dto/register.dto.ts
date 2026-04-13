import { IntersectionType } from '@nestjs/swagger';
import {
  CountryDto,
  DateOfBirthDto,
  EmailDto,
  FirstnameDto,
  GenderDto,
  LastnameDto,
  PasswordDto,
  PhoneCodeDto,
  PhoneDto,
  PhoneISODto,
  StateDto,
} from './username.dto';
import { OtpDto } from '@modules/common-service/dto/otp.dto';

export class UserRegisterDto extends IntersectionType(
  PasswordDto,
  EmailDto,
  OtpDto,
  PhoneDto,
  PhoneCodeDto,
  PhoneISODto,
  CountryDto,
  StateDto,
  GenderDto,
  FirstnameDto,
  LastnameDto,
  DateOfBirthDto,
) {}
