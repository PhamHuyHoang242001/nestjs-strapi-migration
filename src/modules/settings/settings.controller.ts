import { Controller, Get } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { SettingType } from '@modules/databases/setting.entity';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('firmware-version')
  getListFirmwareVersion() {
    return this.settingsService.getValueByKey(SettingType.FIRMWARE_VERSION);
  }
}
