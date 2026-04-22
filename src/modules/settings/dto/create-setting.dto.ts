import { SettingType } from '@modules/databases/setting.entity';
import { IsEnum, IsNotEmpty } from 'class-validator';

export class CreateSettingDto {
  @IsNotEmpty()
  @IsEnum(SettingType)
  key: SettingType;

  @IsNotEmpty()
  value: object;
}
