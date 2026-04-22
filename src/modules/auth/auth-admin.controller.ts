import { HeaderScope } from '@common/decorators/header.decorator';
import { BearerGuard, IsMaintenanceGuard } from '@common/guards';
import { BasicGuard } from '@common/guards/basic.guard';
import { IsAdminGuard } from '@common/guards/is-admin.guard';
import { Body, Controller, HttpCode, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBasicAuth, ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { AdminLoginDto, EmailDto } from './dto';
import { AdminChangePasswordDto } from './dto/change-password.dto';
import { RecoverPasswordDto } from './dto/confirm-forgot-password.dto';

import { UserScope } from '@common/decorators';
import { AccessToken } from './interfaces';
import { USER_CLIENT } from '@common/enums';

@Controller('v1/admin')
@ApiTags('Auth-Admin')
export class AuthAdminController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({ summary: 'login' })
  @ApiBody({
    description: 'login',
    type: AdminLoginDto,
  })
  @Post('login')
  @HttpCode(200)
  @ApiBasicAuth()
  @UseGuards(BasicGuard, IsAdminGuard, IsMaintenanceGuard)
  async login(@Body() body: AdminLoginDto, @HeaderScope() header): Promise<AccessToken> {
    return this.authService.login(body as any, USER_CLIENT.ADMIN, header);
  }

  @ApiOperation({ summary: 'change-password' })
  @ApiBody({
    description: 'change-password',
    type: AdminChangePasswordDto,
  })
  @Put('change-password')
  @ApiBearerAuth()
  @UseGuards(BearerGuard, IsAdminGuard)
  async changePassword(@Body() body: AdminChangePasswordDto, @UserScope() user: Record<string, unknown>) {
    return this.authService.changePassword(body, user['id'] as number);
  }

  @ApiOperation({ summary: 'forgot-password' })
  @ApiBody({
    description: 'forgot-password',
    type: EmailDto,
  })
  @Post('forgot-password')
  @ApiBasicAuth()
  @HttpCode(200)
  @UseGuards(BasicGuard, IsAdminGuard)
  forgotPassword(@Body() body: EmailDto) {
    return this.authService.forgotPassword(body, USER_CLIENT.ADMIN);
  }

  @ApiOperation({ summary: 'admin-recover-password' })
  @ApiBody({
    description: 'admin recover-password',
    type: RecoverPasswordDto,
  })
  @Put('recover-password')
  @ApiBasicAuth()
  @UseGuards(BasicGuard, IsAdminGuard)
  async recoverPassword(@Body() body: RecoverPasswordDto) {
    return this.authService.recoverPassword(body, USER_CLIENT.ADMIN);
  }
}
