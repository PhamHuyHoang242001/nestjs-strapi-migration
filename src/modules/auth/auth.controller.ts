import { UserScope } from '@common/decorators';
import { HeaderScope } from '@common/decorators/header.decorator';
import { BearerGuard, DynamicAuthGuard, HeaderGuard } from '@common/guards';
import { BasicGuard } from '@common/guards/basic.guard';
import { IsMaintenanceGuard } from '@common/guards/is-maintenance.guard';
import { IsUserGuard } from '@common/guards/is-user.guard';
import { Body, Controller, Delete, Get, HttpCode, Post, Put, Res, UseGuards, Query } from '@nestjs/common';
import { ApiBasicAuth, ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { OidcSsoService } from './oidc-sso.service';
import { EmailDto, LogoutDto, RefreshTokenDto, TokenDto, UserLoginDto } from './dto';
import { UserChangePasswordDto } from './dto/change-password.dto';
import { RecoverPasswordDto } from './dto/confirm-forgot-password.dto';
import { AccessToken } from './interfaces';
import { UserRegisterDto } from './dto/register.dto';
import { USER_CLIENT } from '@common/enums';

@Controller(['custom-auth', 'v1/auth'])
@ApiTags('Auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly oidcSsoService: OidcSsoService,
  ) {}

  @ApiOperation({ summary: 'login' })
  @ApiBody({
    description: 'login',
    type: UserLoginDto,
  })
  @Post('login')
  @HttpCode(200)
  @ApiBasicAuth()
  @UseGuards(BasicGuard)
  async login(@Body() body: UserLoginDto, @HeaderScope() header: Record<string, unknown>): Promise<AccessToken> {
    return this.authService.login(body as unknown as UserLoginDto, USER_CLIENT.USER, header as never);
  }

  @Get('login-sso/oidc')
  @ApiOperation({ summary: 'ADFS/OIDC SSO start (Strapi login-sso/oidc)' })
  oidcSignIn(@Query() query: Record<string, unknown>, @Res() res: { redirect: (url: string) => void }) {
    return res.redirect(this.oidcSsoService.buildAuthorizationUrl(query));
  }

  @Get('oidc/authorize')
  @ApiOperation({ summary: 'OIDC authorize alias of login-sso/oidc' })
  oidcAuthorize(@Query() query: Record<string, unknown>, @Res() res: { redirect: (url: string) => void }) {
    return this.oidcSignIn(query, res);
  }

  @Get('oidc/callback')
  @ApiOperation({ summary: 'OIDC/ADFS callback — redirect to end-user login' })
  async oidcCallback(
    @Query() query: Record<string, unknown>,
    @HeaderScope() header: Record<string, unknown>,
    @Res() res: { redirect: (url: string) => void },
  ) {
    const url = await this.oidcSsoService.handleCallback(query, header);
    return res.redirect(url);
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
  async register(@Body() body: UserRegisterDto, @HeaderScope() header: Record<string, unknown>) {
    return this.authService.register(body, header as never);
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
  async refreshSession(
    @Body() body: RefreshTokenDto,
    @HeaderScope() header: Record<string, unknown>,
  ): Promise<AccessToken> {
    return this.authService.refreshSession(body, header as never);
  }

  @ApiBody({
    description: 'Log out and remove refresh token',
    type: LogoutDto,
  })
  @ApiOperation({ summary: 'Log out and remove refresh token' })
  @Post('logout')
  @HttpCode(200)
  async logOut(@Body() body: LogoutDto) {
    return this.authService.logOut(body);
  }

  @ApiOperation({ summary: 'fetch-profile' })
  @ApiBearerAuth()
  @UseGuards(BearerGuard)
  @Get('fetch-profile')
  profile(@UserScope() user: Record<string, unknown>) {
    return this.authService.profile(user as never);
  }

  @ApiOperation({ summary: 'delete-my-account' })
  @ApiBody({
    description: 'verify-opt-delete-account',
    type: TokenDto,
  })
  @Delete('delete-my-account')
  @ApiBearerAuth()
  @UseGuards(BearerGuard)
  async deleteMyAccount(@Body() body: TokenDto, @HeaderScope() header: Record<string, unknown>) {
    return this.authService.deleteMyAccount(body, header as never);
  }

  @ApiOperation({ summary: 'recover-account' })
  @ApiBody({
    description: 'recover-account',
    type: EmailDto,
  })
  @Put('recover-account')
  @UseGuards(HeaderGuard)
  async recoverAccount(@Body() body: EmailDto, @HeaderScope() header: Record<string, unknown>) {
    return this.authService.recoverAccount(body, header as never);
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
  forgotPassword(@Body() body: EmailDto) {
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
  async changePassword(@Body() body: UserChangePasswordDto, @HeaderScope() header: Record<string, unknown>) {
    const { ...data } = body;
    const user = header['user'] as Record<string, unknown>;
    const user_id = user['id'] as number;
    await this.authService.changePassword(data, user_id);
  }
}
