import { IsArray, IsNotEmpty, IsNumber } from 'class-validator';

export class CreateLockDto {
  @IsNotEmpty()
  @IsArray()
  keys: string[];

  @IsNotEmpty()
  @IsNumber()
  expire_time: number;
}
