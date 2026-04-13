import { UserScope } from '@common/decorators';
import { HeaderScope } from '@common/decorators/header.decorator';
import { BearerGuard, DynamicAuthGuard, HeaderGuard } from '@common/guards';
import { BasicGuard } from '@common/guards/basic.guard';
import { IsMaintenanceGuard } from '@common/guards/is-maintenance.guard';
import { IsUserGuard } from '@common/guards/is-user.guard';
import { Body, Controller, Delete, Get, HttpCode, Post, Put, Req, Res, UseGuards, Query } from '@nestjs/common';
import { ApiBasicAuth, ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { EmailDto, LogoutDto, RefreshTokenDto, TokenDto, UserLoginDto } from './dto';
import { UserChangePasswordDto } from './dto/change-password.dto';
import { RecoverPasswordDto } from './dto/confirm-forgot-password.dto';
import { AccessToken } from './interfaces';
import { UserRegisterDto } from './dto/register.dto';
import { VefifyEmailDto } from './dto/verfify-email.dto';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { LIMIT_THROTTLE } from '@constant/index';
import { USER_CLIENT } from '@common/enums';

@Controller('v1/auth')
@ApiTags('Auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @ApiOperation({ summary: 'login' })
  @ApiBody({
    description: 'login',
    type: UserLoginDto,
  })
  @Post('login')
  @HttpCode(200)
  @ApiBasicAuth()
  @UseGuards(BasicGuard, IsUserGuard, IsMaintenanceGuard)
  async login(@Body() body: UserLoginDto, @HeaderScope() header): Promise<AccessToken> {
    return this.authService.login(body as any, USER_CLIENT.USER, header);
  }

  @Get('oidc/authorize')
  @ApiOperation({ summary: 'OIDC authorize (redirect to provider)' })
  async oidcAuthorize(@HeaderScope() header, @Res() res) {
    // Build authorization URL and redirect
    const state = header && header.device_hash ? encodeURIComponent(header.device_hash) : '';
    const params: any = {
      client_id: process.env.OIDC_CLIENT_ID || undefined,
      response_type: 'code',
      scope: process.env.OIDC_SCOPE || 'openid profile email',
      redirect_uri: process.env.OIDC_REDIRECT_URI || undefined,
    };
    const query = Object.keys(params)
      .filter((k) => params[k])
      .map((k) => `${k}=${encodeURIComponent(params[k])}`)
      .join('&');
    const url = `${process.env.OIDC_AUTHORIZATION_ENDPOINT || ''}?${query}${state ? `&state=${state}` : ''}`;
    return res.redirect(url);
  }

  @Get('oidc/callback')
  @ApiOperation({ summary: 'OIDC callback' })
  async oidcCallback(@Query('code') code: string, @HeaderScope() header) {
    return this.authService.handleOidcCallback(code, header);
  }

  @ApiOperation({ summary: 'register' })
  @ApiBody({
    description: 'resgitser',
    type: UserRegisterDto,
  })
  @Post('register')
  @HttpCode(200)
  @ApiBasicAuth()
  @UseGuards(BasicGuard, IsMaintenanceGuard)
  async register(@Body() body: UserRegisterDto, @HeaderScope() header) {
    return this.authService.register(body, header);
  }

  @ApiOperation({ summary: 'refresh session ' })
  @ApiBody({
    description: 'refresh session',
    type: RefreshTokenDto,
  })
  @Post('refresh-session')
  @HttpCode(200)
  @ApiBasicAuth()
  @UseGuards(DynamicAuthGuard)
  async refreshSession(@Body() body: RefreshTokenDto, @HeaderScope() header): Promise<AccessToken> {
    return this.authService.refreshSession(body, header);
  }

  @ApiBody({
    description: 'Log out and remove refresh token',
    type: LogoutDto,
  })
  @ApiOperation({ summary: 'Log out and remove refresh token' })
  @Post('logout')
  @HttpCode(200)
  async logOut(@Body() body: LogoutDto) {
    return await this.authService.logOut(body);
  }

  @ApiOperation({ summary: 'fetch-profile' })
  @ApiBearerAuth()
  @UseGuards(BearerGuard)
  @Get('fetch-profile')
  async profile(@UserScope() user) {
    return this.authService.profile(user);
  }

  @ApiOperation({ summary: 'delete-my-account' })
  @ApiBody({
    description: 'verify-opt-delete-account',
    type: TokenDto,
  })
  @Delete('delete-my-account')
  @ApiBearerAuth()
  @UseGuards(BearerGuard)
  async deleteMyAccount(@Body() body: TokenDto, @HeaderScope() header) {
    return this.authService.deleteMyAccount(body, header);
  }

  @ApiOperation({ summary: 'recover-account' })
  @ApiBody({
    description: 'recover-account',
    type: EmailDto,
  })
  @Put('recover-account')
  @UseGuards(HeaderGuard)
  async recoverAccount(@Body() body: EmailDto, @HeaderScope() header) {
    return this.authService.recoverAccount(body, header);
  }

  @ApiOperation({ summary: 'forgot-password' })
  @ApiBody({
    description: 'forgot-password',
    type: EmailDto,
  })
  @Post('forgot-password')
  @ApiBasicAuth()
  @HttpCode(200)
  @UseGuards(BasicGuard)
  async forgotPassword(@Body() body: EmailDto) {
    return this.authService.forgotPassword(body, USER_CLIENT.USER);
  }


  @ApiOperation({ summary: 'recover-password' })
  @ApiBody({
    description: 'recover-password',
    type: RecoverPasswordDto,
  })
  @Put('recover-password')
  @ApiBasicAuth()
  @UseGuards(BasicGuard)
  async recoverPassword(@Body() body: RecoverPasswordDto) {
    return this.authService.recoverPassword(body, USER_CLIENT.USER);
  }

  @ApiOperation({ summary: 'change-password' })
  @ApiBody({
    description: 'change-password',
    type: UserChangePasswordDto,
  })
  @Put('change-password')
  @ApiBearerAuth()
  @UseGuards(BearerGuard, IsUserGuard)
  async changePassword(@Body() body: UserChangePasswordDto, @HeaderScope() header) {
    const { ...data } = body;
    const user_id = header.user.id;
    await this.authService.changePassword(data, user_id);
  }
}
