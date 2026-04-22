import { BasicGuard } from '@common/guards';
import { PasswordDto } from '@modules/auth/dto';
import { Controller, Get } from '@nestjs/common';
import { Body, HttpCode, Post, UseGuards } from '@nestjs/common/decorators';
import { ApiBasicAuth, ApiOperation } from '@nestjs/swagger';
import { AppService } from './app.service';
import { sha256Password } from './service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('ping')
  @ApiOperation({ summary: 'Health check api' })
  ping(): string {
    return this.appService.ping();
  }

  @ApiOperation({ summary: 'check-hash' })
  @Post('check-hash')
  @HttpCode(200)
  @ApiBasicAuth()
  @UseGuards(BasicGuard)
  checkHash(@Body() body: PasswordDto) {
    const { password } = body;
    return { data: sha256Password(password) };
  }
}
