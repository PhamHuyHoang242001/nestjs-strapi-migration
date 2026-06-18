import { BearerGuard } from '@common/guards';
import { IsAdminGuard } from '@common/guards/is-admin.guard';
import { RequestWithInfo } from '@common/types/request-with-info';
import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RenderServiceTokenDto } from './dto/render-service-token.dto';
import { IsServiceAdminGuard } from './guards/is-service-admin.guard';
import { ServiceTokenService } from './service-token.service';

@ApiTags('Service Token')
@Controller()
export class ServiceTokenController {
  constructor(private readonly serviceTokenService: ServiceTokenService) {}

  @Post('render-service-token')
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mint a service token (SUPER_ADMIN / SERVICE_ADMIN only)' })
  @UseGuards(BearerGuard, IsAdminGuard, IsServiceAdminGuard)
  renderServiceToken(@Body() body: RenderServiceTokenDto, @Req() req: RequestWithInfo) {
    const adminId = req.info?.user?.['id'] as number | undefined;
    return this.serviceTokenService.generateServiceToken(body, adminId);
  }
}
