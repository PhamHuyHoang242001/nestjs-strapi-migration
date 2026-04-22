import { UserScope } from '@common/decorators';
import { BearerGuard } from '@common/guards';
import { IsUserGuard } from '@common/guards/is-user.guard';
import { UsersService } from '@modules/users/users.service';
import { Body, Controller, Get, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBasicAuth, ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SearchUserAddressDto } from './dto/search-user-address.dto';
import { Users } from '@modules/databases/user.entity';
import { UpdateMyProfileDto, UserProfileDto } from './dto/user-profile.dto';
import { DeleteMyAccountDto } from './dto/delete-my-account.dto';
import { SortType } from '@common/enums';

@Controller('v1/users')
@ApiTags('users')
@ApiBearerAuth()
@ApiBasicAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('order-address')
  @UseGuards(BearerGuard)
  async getListOrderAddress(@UserScope('id') user_id: number, @Query() query: SearchUserAddressDto) {
    query.user_id = user_id;
    query.sort = {
      ...query.sort,
      created_at: SortType.ASC,
    };
    return this.usersService.getListOrderAddress(query);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get my user profile' })
  @UseGuards(BearerGuard, IsUserGuard)
  getMyProfile(@UserScope() user: Users): UserProfileDto {
    return this.usersService.getMyProfile(user);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update my user profile' })
  @UseGuards(BearerGuard, IsUserGuard)
  @ApiBody({ type: UpdateMyProfileDto })
  updateMyProfile(@UserScope() user: Users, @Body() body: UpdateMyProfileDto): Promise<UserProfileDto> {
    return this.usersService.updateMyProfile(user, body);
  }

  @Patch('delete/me')
  @ApiOperation({ summary: 'Delete my account' })
  @UseGuards(BearerGuard, IsUserGuard)
  @ApiBody({ type: DeleteMyAccountDto })
  deleteMyAccount(@UserScope() user: Users, @Body() body: DeleteMyAccountDto): Promise<{ user_id: number }> {
    return this.usersService.deleteMyAccount(user, body);
  }
}
