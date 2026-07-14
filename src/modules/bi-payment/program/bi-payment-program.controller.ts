import { PaginationDecorator, PaginationParams } from '@common/decorators/pagination.decorator';
import { RequireDataAccess } from '@common/authorization/decorators/require-data-access.decorator';
import { RequirePermission } from '@common/authorization/decorators/require-permission.decorator';
import { OwnerScopeGuard } from '@common/authorization/guards/owner-scope.guard';
import { PermissionGuard } from '@common/authorization/guards/permission.guard';
import { DataAccessInterceptor } from '@common/authorization/interceptors/data-access.interceptor';
import { DATA_ACCESS_TABLE } from '@common/enums';
import { BearerGuard } from '@common/guards';
import { IsMaintenanceGuard } from '@common/guards/is-maintenance.guard';
import { RequestWithInfo } from '@common/types/request-with-info';
import { SortCamel, SortCamelParams } from '../common/decorators/sort-camel.decorator';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BiPaymentProgramService } from './bi-payment-program.service';
import { CreateBiPaymentProgramDto, SearchBiPaymentProgramDto, UpdateBiPaymentProgramDto } from './dto';

const TABLE = DATA_ACCESS_TABLE.BI_PAYMENT_PROGRAMS;

// Strapi parity: path /bi-payment/program, RESTful thô. Sub-resource via @Query. Guard order LOCKED.
// global prefix `api` (main.ts) + controller `bi-payment/program` → /api/bi-payment/program (matches Strapi v5).
@Controller('bi-payment/program')
@ApiTags('bi-payment-program')
@ApiBearerAuth()
@UseGuards(BearerGuard, IsMaintenanceGuard, PermissionGuard, OwnerScopeGuard)
@UseInterceptors(DataAccessInterceptor)
export class BiPaymentProgramController {
  constructor(private readonly service: BiPaymentProgramService) {}

  // GET /bi-payment/program — Strapi findProgram.
  @ApiOperation({ summary: 'List BI Payment programs' })
  @Get()
  @RequirePermission('bp_program_view')
  @RequireDataAccess(TABLE, 'bp_program_view')
  list(
    @Query() query: SearchBiPaymentProgramDto,
    @SortCamel({ allowedFields: ['createdAt', 'name', 'code', 'workstepCurrent'] }) sortParams: SortCamelParams,
    @PaginationDecorator() pagination: PaginationParams,
    @Req() req: RequestWithInfo,
  ) {
    return this.service.search(query, sortParams, pagination, req.info?.dataScope ?? null);
  }

  // GET /bi-payment/program/:id — Strapi findProgramById.
  @ApiOperation({ summary: 'Get BI Payment program details' })
  @Get(':id')
  @RequirePermission('bp_program_view')
  @RequireDataAccess(TABLE, 'bp_program_view')
  details(@Param('id') id: number, @Req() req: RequestWithInfo) {
    return this.service.details(+id, req.info?.dataScope ?? null);
  }

  // POST /bi-payment/program — Strapi createProgram.
  @ApiOperation({ summary: 'Create BI Payment program' })
  @Post()
  @HttpCode(200)
  @RequirePermission('bp_program_create')
  create(@Body() body: CreateBiPaymentProgramDto, @Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number | undefined;
    return this.service.create(body, userId ? +userId : undefined);
  }

  // PATCH /bi-payment/program/:id — Strapi updateProgram (PATCH, không PUT).
  @ApiOperation({ summary: 'Update BI Payment program' })
  @Patch(':id')
  @RequirePermission('bp_program_edit')
  @RequireDataAccess(TABLE, 'bp_program_edit')
  update(@Param('id') id: number, @Body() body: UpdateBiPaymentProgramDto, @Req() req: RequestWithInfo) {
    return this.service.update(+id, body, req.info?.dataScope ?? null);
  }

  // DELETE /bi-payment/program — Strapi deleteManyProgram (body ids).
  @ApiOperation({ summary: 'Delete many programs (soft delete)' })
  @Delete()
  @RequirePermission('bp_program_delete')
  @RequireDataAccess(TABLE, 'bp_program_delete')
  deleteMany(@Body() body: { ids: number[] }, @Req() req: RequestWithInfo) {
    return this.service.deleteMany(body.ids ?? [], req.info?.dataScope ?? null);
  }

  // DELETE /bi-payment/program/:id — Strapi deleteProgram.
  @ApiOperation({ summary: 'Delete BI Payment program (soft delete)' })
  @Delete(':id')
  @RequirePermission('bp_program_delete')
  @RequireDataAccess(TABLE, 'bp_program_delete')
  delete(@Param('id') id: number, @Req() req: RequestWithInfo) {
    return this.service.delete(+id, req.info?.dataScope ?? null);
  }

  // GET /bi-payment/program/user-updated — Strapi findUserUpdatedProgram.
  @ApiOperation({ summary: 'List programs updated by current user' })
  @Get('user-updated')
  @RequirePermission('bp_program_view')
  @RequireDataAccess(TABLE, 'bp_program_view')
  userUpdated(@Req() req: RequestWithInfo) {
    const userId = req.info?.user?.id as number | undefined;
    return this.service.listUserUpdated(userId ? +userId : 0, req.info?.dataScope ?? null);
  }
}
