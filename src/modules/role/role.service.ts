import { PaginationParams } from '@common/decorators/pagination.decorator';
import { SortParams } from '@common/decorators/sort.decorator';
import { StatusDto } from '@common/dto';
import { SortType, STATUS } from '@common/enums';
import { execQueryAll, execQueryPaignation } from '@common/utils';
import { MODEL_ROLE_NAME_EXISTS, MODEL_ROLE_USING_CAN_NOT_DELETE } from '@constant/error-messages';
import { LIMIT_GET_ALL } from '@constant/index';
import { Permission } from '@modules/databases/permission.entity';
import { PermissionRepository } from '@modules/permission/repository/permission.repository';
import { UserRepository } from '@modules/users/repository/users.repository';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, Not } from 'typeorm';
import { ListRoleDto } from './dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RoleRepository } from './repository/role.repository';

@Injectable()
export class RoleService {
  constructor(
    private readonly roleRepository: RoleRepository,
    private readonly userRepository: UserRepository,

    private readonly permissionRepository: PermissionRepository,
    private readonly connection: DataSource,
  ) {}

  async validateForm(data: CreateRoleDto) {
    const { name } = data;
    const rs = await this.roleRepository.findOneByCondition({ name });
    if (rs) throw new BadRequestException(MODEL_ROLE_NAME_EXISTS);
    data.screen = data.screen.concat(data.sub_screen);
    return data;
  }
  async create(payload: CreateRoleDto, user_id: number) {
    const { permission, ...data } = payload;
    const rowCreated = await this.roleRepository.save({
      ...data,
      permissions: permission.map((id) => ({ id }) as Permission),
      user_id,
    });
    return { id: rowCreated.id };
  }
  checkPermissionSelected(permission_selected: Permission[], permission) {
    if (permission_selected.find((u) => u.id == permission.id)) return true;
    return false;
  }
  async details(id: number) {
    const role = await this.roleRepository.findDetailRelation(id);
    return role;
  }

  async validateFormUpdate(payload: UpdateRoleDto, id: number) {
    const { sub_screen, ...data } = payload;
    const pipeline = [{ id }, { id: Not(id), name: data.name }];
    const rs = await this.roleRepository.findListByCondition(pipeline, 0, 2);
    if (!rs.find((u) => u.id === id)) throw new NotFoundException();
    if (rs.find((u) => u.name == data.name && u.id != id)) throw new BadRequestException(MODEL_ROLE_NAME_EXISTS);
    data.screen = data.screen.concat(sub_screen);
    return data;
  }

  async update(id: number, payload: UpdateRoleDto) {
    const { permission, screen, ...data } = payload;
    await this.roleRepository.save({
      id,
      ...data,
      permissions: permission.map((id) => ({ id }) as Permission),
    });
    return { id };
  }

  async setStatus(id: number, data: StatusDto) {
    const { status } = data;
    const rs = await this.roleRepository.findOneByIdValid(id);
    if (rs.status != status) await this.roleRepository.updateOne({ id: rs.id }, { status });
    return { id, status };
  }
  async delete(id: number) {
    await this.roleRepository.findOneByIdValid(id);
    const rs = await this.userRepository.findOneByCondition({ role_id: id });
    if (rs) throw new BadRequestException(MODEL_ROLE_USING_CAN_NOT_DELETE);
    await this.roleRepository.softDelete({ id });
  }

  async getAll() {
    let result = [];
    const options = { skip: 0, limit: LIMIT_GET_ALL, sort: { id: SortType.DESC } };
    const pipeline = {
      status: STATUS.ACTIVE,
    };

    while (true) {
      const data = await this.roleRepository.findListByCondition(pipeline, options.skip, options.limit, options.sort);
      if (!data?.length) break;
      result = result.concat(data);
      if (data?.length < options.limit) break;
      options.skip += options.limit;
    }

    return { data: result };
  }

  async search(payload: ListRoleDto, sortParam: SortParams, paginationParams: PaginationParams) {
    const queryBuilder = this.roleRepository.buildQueryBuilderRole(payload, sortParam);
    const { page, limit } = paginationParams;
    if (limit === -1) return execQueryAll(queryBuilder);
    return execQueryPaignation(queryBuilder, page, limit);
  }
}
