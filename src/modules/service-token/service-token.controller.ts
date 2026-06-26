import { RequirePermission } from '@common/authorization/decorators/require-permission.decorator';
import { PermissionGuard } from '@common/authorization/guards/permission.guard';
import { PaginationDecorator, PaginationParams } from '@common/decorators/pagination.decorator';
import { Sort, SortParams } from '@common/decorators/sort.decorator';
import { BearerGuard } from '@common/guards';
import { RequestWithInfo } from '@common/types/request-with-info';
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ListServiceTokenDto } from './dto/list-service-token.dto';
import { RenderServiceTokenDto } from './dto/render-service-token.dto';
import { UpdateServiceTokenNameDto } from './dto/update-service-token-name.dto';
import { ServiceTokenService } from './service-token.service';

@ApiTags('Service Token')
@ApiBearerAuth()
@Controller()
@UseGuards(BearerGuard, PermissionGuard)
export class ServiceTokenController {
  constructor(private readonly serviceTokenService: ServiceTokenService) {}

  @Post('render-service-token')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mint a service token' })
  @RequirePermission('service_token_create')
  renderServiceToken(@Body() body: RenderServiceTokenDto, @Req() req: RequestWithInfo) {
    const adminId = req.info?.user?.['id'] as number | undefined;
    return this.serviceTokenService.generateServiceToken(body, adminId);
  }

  @Get('service-token/search')
  @ApiOperation({ summary: 'List service tokens (paginated, search by name; token value hidden)' })
  @RequirePermission('service_token_view')
  search(
    @PaginationDecorator() paginationParams: PaginationParams,
    @Sort({ allowedFields: ['id', 'name'], default: { sort_field: 'id', sort_order: 'desc' } }) sortParams: SortParams,
    @Query() query: ListServiceTokenDto,
  ) {
    return this.serviceTokenService.search(query, sortParams, paginationParams);
  }

  @Get('service-token/details')
  @ApiOperation({ summary: 'Get a service token by id (includes token value)' })
  @RequirePermission('service_token_view')
  details(@Query('id') id: number) {
    return this.serviceTokenService.details(Number(id));
  }

  @Patch('service-token/update/:id')
  @ApiOperation({ summary: 'Update service token name only' })
  @RequirePermission('service_token_edit')
  update(@Param('id') id: number, @Body() body: UpdateServiceTokenNameDto, @Req() req: RequestWithInfo) {
    const adminId = req.info?.user?.['id'] as number | undefined;
    return this.serviceTokenService.updateName(Number(id), body.name, adminId);
  }

  @Delete('service-token/delete/:id')
  @ApiOperation({ summary: 'Soft-delete (revoke) a service token' })
  @RequirePermission('service_token_delete')
  delete(@Param('id') id: number, @Req() req: RequestWithInfo) {
    const adminId = req.info?.user?.['id'] as number | undefined;
    return this.serviceTokenService.softDelete(Number(id), adminId);
  }
}
