import { PaginationParams } from '@common/decorators/pagination.decorator';
import { SortParams } from '@common/decorators/sort.decorator';
import { SortType } from '@common/enums';
import { execQueryAll, execQueryPaignation } from '@common/utils';
import { MODEL_PERMISSION_CODE_INVAID, MODEL_PERMISSION_USING_CAN_NOT_DELETE } from '@constant/error-messages';
import { LIMIT_GET_ALL } from '@constant/index';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Not } from 'typeorm';
import { ListPermissionDto } from './dto';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { PermissionRepository } from './repository/permission.repository';

@Injectable()
export class PermissionService {
  constructor(private readonly permissionRepository: PermissionRepository) {}
  async validateForm(data: CreatePermissionDto) {
    const { code, screen_id } = data;
    if (await this.permissionRepository.findOneByCondition({ code }))
      throw new BadRequestException(MODEL_PERMISSION_CODE_INVAID);

    if (!screen_id) return data;

    return data;
  }
  async create(data: CreatePermissionDto) {
    const rowCreated = await this.permissionRepository.save({
      ...data,
    });
    return { id: rowCreated.id };
  }
  async details(id: number) {
    return this.permissionRepository.findDetailRelation(id);
  }

  async validateFormUpdate(data: UpdatePermissionDto, id: number) {
    const { screen_id, code } = data;
    const pipeline = [{ id }, { id: Not(id), code }];

    const rs = await this.permissionRepository.findListByCondition(pipeline, 0, 2);

    if (!rs) throw new NotFoundException();
    if (rs.find((u) => u.code == code && u.id != id)) throw new BadRequestException(MODEL_PERMISSION_CODE_INVAID);
    return data;
  }

  async update(id: number, data: UpdatePermissionDto) {
    await this.permissionRepository.updateOne(
      { id },
      {
        ...data,
      },
    );
    return { id };
  }

  async delete(id: number) {
    await this.permissionRepository.findOneByIdValid(id);
    const rs = await this.permissionRepository.findOneByCondition({ screen_id: id });
    if (rs) throw new BadRequestException(MODEL_PERMISSION_USING_CAN_NOT_DELETE);
    await this.permissionRepository.softDelete({ id });
  }

  async getAll() {
    let result = [];
    const options = { skip: 0, limit: LIMIT_GET_ALL, sort: { id: SortType.DESC } };

    while (true) {
      const data = await this.permissionRepository.findListByCondition({}, options.skip, options.limit, options.sort);
      if (!data?.length) break;
      result = result.concat(data);
      if (data?.length < options.limit) break;
      options.skip += options.limit;
    }

    return { data: result };
  }

  async search(payload: ListPermissionDto, sortParam: SortParams, paginationParams: PaginationParams) {
    const queryBuilder = this.permissionRepository.buildQueryBuilderPermission(payload, sortParam);
    const { page, limit } = paginationParams;
    if (limit === -1) return execQueryAll(queryBuilder);
    return execQueryPaignation(queryBuilder, page, limit);
  }
}
