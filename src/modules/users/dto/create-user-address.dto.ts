import { EmailDto } from '@common/dto/common.dto';
import {
  CountryDto,
  FirstnameDto,
  LastnameDto,
  PhoneCodeDto,
  PhoneDto,
  StateDto,
  TownCityDto,
  ZipCodeDto,
} from '@modules/auth/dto';
import { ApiProperty, IntersectionType } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateUserAddressDto extends IntersectionType(
  FirstnameDto,
  LastnameDto,
  PhoneCodeDto,
  PhoneDto,
  EmailDto,
  StateDto,
  CountryDto,
  ZipCodeDto,
  TownCityDto,
) {
  @ApiProperty({ description: 'address line ' })
  @IsString()
  @IsNotEmpty()
  public address_line_1: string;

  @ApiProperty({ description: 'notes' })
  @IsOptional()
  @IsString()
  notes: string;

}
export class CreateUserAddressDto extends IntersectionType(UpdateUserAddressDto) {
  @ApiProperty({ description: 'is save ' })
  @IsBoolean()
  @IsOptional()
  public is_save: boolean = false;
}
