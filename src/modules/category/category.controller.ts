import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BearerGuard } from '@common/guards/bearer.guard';
import { PermissionGuard } from '@common/authorization/guards/permission.guard';
import { RequirePermission } from '@common/authorization/decorators/require-permission.decorator';
import { CategoryService } from './category.service';
import { CategoryTypeQueryDto, CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

@Controller('v1/categories')
@ApiTags('categories')
@ApiBearerAuth()
@UseGuards(BearerGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class CategoryController {
  constructor(private readonly service: CategoryService) {}

  @Get()
  list(@Query() query: CategoryTypeQueryDto) { return this.service.list(query.type, query.include_inactive); }

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('asset_category_manage')
  create(@Body() dto: CreateCategoryDto) { return this.service.create(dto); }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('asset_category_manage')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCategoryDto) { return this.service.update(id, dto); }

  @Delete(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('asset_category_manage')
  deactivate(@Param('id', ParseIntPipe) id: number) { return this.service.deactivate(id); }
}
