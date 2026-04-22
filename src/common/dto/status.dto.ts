import { STATUS } from '@common/enums';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class StatusDto {
  @ApiProperty({ enum: STATUS, required: true, default: STATUS.ACTIVE })
  @IsNotEmpty()
  @IsString()
  @IsEnum(STATUS)
  public status: STATUS;
}
export class NoteDto {
  @ApiProperty({ required: false, default: null })
  @IsString()
  @IsOptional()
  public note?: string;
}
export class DescriptionDto {
  @ApiProperty({ required: false, default: null })
  @IsString()
  @IsOptional()
  public description?: string;
}
export class StatusOptionalDto {
  @ApiProperty({ enum: STATUS, required: true, default: STATUS.ACTIVE })
  @IsOptional()
  @IsString()
  @IsEnum(STATUS)
  public status?: STATUS;
}
