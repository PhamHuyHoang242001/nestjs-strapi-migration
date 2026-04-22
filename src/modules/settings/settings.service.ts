import { Injectable } from '@nestjs/common';
import { SettingRepository } from './repository/setting.repository';

@Injectable()
export class SettingsService {
  constructor(private readonly settingRepository: SettingRepository) {}
  getValueByKey(key: string) {
    return this.settingRepository.findOneBy({ key });
  }
}
