import { BadRequestException, Injectable } from '@nestjs/common';
import { Not } from 'typeorm';
import { UserRepository } from './repository/users.repository';
import { SearchingUserDto } from './dto';
import { PageDto, PageMetaDto } from '@common/dto/paginate.dto';
import { CreateUserAddressDto, UpdateUserAddressDto } from './dto/create-user-address.dto';
import { INVALID_DATA } from '@constant/error-messages';

import { UserAddressRepository } from './repository/users-address.repository';
import { SearchUserAddressDto } from './dto/search-user-address.dto';
import { Users } from '@modules/databases/user.entity';
import { UpdateMyProfileDto, UserProfileDto } from './dto/user-profile.dto';
import { DeleteMyAccountDto } from './dto/delete-my-account.dto';
import { USER_STATUS } from '@common/enums';
import { ERROR_CODE } from '@constant/error-code';
import { AuthService } from '@modules/auth/auth.service';
import { TokenRepository } from '@modules/token/repository/token.repository';
import { DayJS } from '@common/utils/dayjs';
import {
  FEDEX_ORDER_ADDRESS_MAX_LENGTH,
  ORDER_ADDRESS_CITY_MAX_LENGTH,
  ORDER_ADDRESS_COUNTRY_CODE_MAX_LENGTH,
  ORDER_ADDRESS_EMAIL_MAX_LENGTH,
  ORDER_ADDRESS_FIRST_NAME_MAX_LENGTH,
  ORDER_ADDRESS_LAST_NAME_MAX_LENGTH,
  ORDER_ADDRESS_PHONE_NUMBER_LENGTH,
  ORDER_ADDRESS_STATE_CODE_MAX_LENGTH,
  ORDER_ADDRESS_ZIP_CODE_MAX_LENGTH,
  USPS_ORDER_ADDRESS_MAX_LENGTH,
  VerifyOrderAddressDto,
} from './dto/verify-user-address.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly userAddressRepository: UserAddressRepository,
    private readonly tokenRepository: TokenRepository,
    private readonly authService: AuthService,
  ) { }

  findUsingSocialId({ apple_id, google_id }: { apple_id?: string | null; google_id?: string | null }) {
    if (!google_id && !apple_id) {
      throw new Error('Invalid parameters given');
    } else if (apple_id && google_id) {
      throw new Error('Provide only one parameter');
    }

    return this.userRepository.findOneByCondition({
      apple_id,
      google_id,
    });
  }

  async findAll(query: SearchingUserDto) {
    const { page, limit } = query;
    const { entities, itemCount } = await this.userRepository.findAll(query);
    const pageMetaDto = new PageMetaDto({ itemCount, page, limit });
    return new PageDto(entities, pageMetaDto);
  }

  async findOne(user_id: number) {
    return this.userRepository.findOneById(user_id);
  }

  async getListOrderAddress(query: SearchUserAddressDto) {
    const { page, limit } = query;
    const { entities, itemCount } = await this.userAddressRepository.findAll(query);
    const pageMetaDto = new PageMetaDto({ itemCount, page, limit });
    return new PageDto(entities, pageMetaDto);
  }

  getMyProfile(user: Users): UserProfileDto {
    const {
      id,
      first_name,
      last_name,
      email,
      phone_code,
      phone,
      date_of_birth,
      country,
      country_iso,
      phone_iso,
      state,
      state_iso,
      gender,
      password,
    } = user;

    return {
      id,
      first_name,
      last_name,
      email,
      phone_code,
      phone,
      date_of_birth,
      country,
      country_iso,
      phone_iso,
      state,
      state_iso,
      gender,
      social_link: password ? false : true,
    };
  }

  async updateMyProfile(user: Users, body: UpdateMyProfileDto): Promise<UserProfileDto> {
    const { id: userId, email: currentEmail, password } = user;
    const {
      country_iso,
      state_iso,
      phone,
      phone_code,
      email,
      date_of_birth: dateOfBirth,
      first_name: firstName,
      last_name: lastName,
    } = body;

    // firstname & lastname is require
    if (!firstName) delete body.first_name;
    if (!lastName) delete body.last_name;

    // only sso users can update their email
    const isSocialUser = password ? false : true;
    if (!isSocialUser || currentEmail) {
      delete body.email;
    }

    const { validCountry, validState } = await this.authService.validateAddress(
      country_iso,
      state_iso,
      phone,
      phone_code,
    );

    if (validCountry) {
      Object.assign(body, { country: validCountry.name, country_iso });
    }
    if (validState) {
      Object.assign(body, { state: validState.name, state_iso });
    }

    if (email) {
      const existedUser = await this.userRepository.findOne({ where: { email, id: Not(userId) } });
      if (existedUser) {
        throw new BadRequestException(ERROR_CODE.A009);
      }
    }
    if (dateOfBirth) {
      const currentTime = DayJS().utc().startOf('day');
      const dob = DayJS(dateOfBirth).utc().startOf('day');
      if (dob.isAfter(currentTime)) {
        throw new BadRequestException(`Date of birth can't be in the future.`);
      }
      body.date_of_birth = dob.format('YYYY-MM-DD');
    }

    const updateResult = await this.userRepository.updateUserProfile(userId, body);
    const updatedUser: Users = updateResult.raw[0];

    return this.getMyProfile(updatedUser);
  }

  async deleteMyAccount(user: Users, body: DeleteMyAccountDto): Promise<{ user_id: number }> {
    const { id: userId, status } = user;
    const { reason } = body;

    if (status !== USER_STATUS.ACTIVE) {
      throw new BadRequestException(ERROR_CODE.A009);
    }

    // delete my account
    await this.userRepository.deleteMyAccount(userId, reason);

    // delete tokens
    await this.tokenRepository.destroyAllUserTokens(userId);

    return {
      user_id: userId,
    };
  }

  findOneByEmail(email: string) {
    return this.userRepository.findOneBy({ email });
  }
}
