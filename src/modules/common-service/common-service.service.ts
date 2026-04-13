import { BadRequestException, Injectable } from '@nestjs/common';
import { SettingsService } from '@modules/settings/settings.service';
import { SettingType } from '@modules/databases/setting.entity';
import { TEMPLATE_ID } from '@constant/template';
import {
  USER_STATUS,
} from '@common/enums';
import { OtpRepository } from './repository/otp.repository';
import { DataSource, EntityManager, In } from 'typeorm';

import * as dayjs from 'dayjs';
import { UserRepository } from '@modules/users/repository/users.repository';
import { LockRepository } from './repository/lock.repository';
import { CreateLockDto } from './dto/create-lock.dto';
import { Lock } from '@modules/databases/lock.entity';

@Injectable()
export class CommonServiceService {
  constructor(
    private readonly connection: DataSource,
    private readonly settingService: SettingsService,
    private readonly otpRepository: OtpRepository,
    private readonly userRepository: UserRepository,
    private readonly lockRepository: LockRepository,
  ) { }

  async withLock(data: CreateLockDto, transaction: EntityManager, fn: Function) {
    const { keys, expire_time } = data;
    try {
      const locks = keys.map((key) => this.lockRepository.create({ key, expire_time }));
      await transaction.save(locks);
      await fn();
    } catch (err) {
      console.log(err);
    }
    await transaction
      .createQueryBuilder()
      .delete()
      .from(Lock)
      .where({ key: In(keys) })
      .execute();
  }

  createLock(data: CreateLockDto) {
    return this.lockRepository.create(data);
  }

  async deleteLocksByKeys(keys: string[]) {
    await this.lockRepository.delete({ key: In(keys) });
  }

  async getListCountry() {
    const countries = await this.settingService.getValueByKey(SettingType.LIST_COUNTRIES);
    return countries?.value;
  }


  async createOtp(rs_id: number, template_id: TEMPLATE_ID, code: string, expire_time: number) {

    return await this.otpRepository.save({
      user_id: rs_id,
      code,
      expire_time,
      template_id,
    });
  }


  async findGuestById(guest_id: string) {
    const user = this.userRepository.findOneBy({ guest_id });
    if (!user) throw new BadRequestException('Guest not found');
    return user;
  }

  async findOneOrCreateGuest(guest_id: string) {
    let guest = await this.findGuestById(guest_id);
    if (guest) return guest;
    return this.userRepository.save({ guest_id, status: USER_STATUS.ANONYMOUS, is_registered: false });
  }


}
