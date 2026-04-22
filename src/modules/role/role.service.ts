import { PaginationParams } from '@common/decorators/pagination.decorator';
import { SortParams } from '@common/decorators/sort.decorator';
import { StatusDto } from '@common/dto';
import { SortType, STATUS } from '@common/enums';
import { execQueryAll, execQueryPaignation } from '@common/utils';
import { MODEL_ROLE_NAME_EXISTS, MODEL_ROLE_USING_CAN_NOT_DELETE, NOT_FOUND } from '@constant/error-messages';
import { LIMIT_GET_ALL } from '@constant/index';
import { Permission } from '@modules/databases/permission.entity';
import { UserRole } from '@modules/databases/user-role.entity';
import { PermissionRepository } from '@modules/permission/repository/permission.repository';
import { UserRepository } from '@modules/users/repository/users.repository';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, In, Not } from 'typeorm';
import { ListRoleDto } from './dto';
import { AssignUsersRoleDto } from './dto/assign-users-role.dto';
import { CloneRoleDto } from './dto/clone-role.dto';
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
  checkPermissionSelected(permission_selected: Permission[], permission: { id: number }) {
    if (permission_selected.find((u) => u.id == permission.id)) return true;
    return false;
  }
  async details(id: number) {
    const role = await this.roleRepository.findDetailRelationWithModule(id);
    // Group permissions by module for easier frontend consumption
    const permissions_by_module: Record<string, Permission[]> = {};
    if (role.permissions) {
      for (const perm of role.permissions) {
        const moduleKey = perm.module ? perm.module.name : 'uncategorized';
        if (!permissions_by_module[moduleKey]) permissions_by_module[moduleKey] = [];
        permissions_by_module[moduleKey].push(perm);
      }
    }
    return { ...role, permissions_by_module };
  }

  async clone(id: number, dto: CloneRoleDto, user_id: number) {
    // Find source role with permissions
    const sourceRole = await this.roleRepository.findOne({ where: { id }, relations: ['permissions'] });
    if (!sourceRole) throw new NotFoundException(NOT_FOUND);

    // Validate name uniqueness
    const existing = await this.roleRepository.findOneByCondition({ name: dto.name });
    if (existing) throw new BadRequestException(MODEL_ROLE_NAME_EXISTS);

    // Save new role with same permissions + new name/code
    const newRole = await this.roleRepository.save({
      name: dto.name,
      code: dto.code ?? null,
      description: sourceRole.description,
      permissions: sourceRole.permissions,
      user_id,
    });
    return { id: newRole.id };
  }

  async getUsersInRole(roleId: number, search: string, paginationParams: PaginationParams) {
    const userRoleRepo = this.connection.getRepository(UserRole);
    const query = userRoleRepo
      .createQueryBuilder('ur')
      .innerJoinAndSelect('ur.user', 'user')
      .where('ur.role_id = :roleId', { roleId });

    if (search) {
      query.andWhere(
        '(unaccent(user.full_name) ILIKE unaccent(:search) OR unaccent(user.email) ILIKE unaccent(:search) OR unaccent(user.username) ILIKE unaccent(:search))',
        { search: `%${search}%` },
      );
    }

    const { page, limit } = paginationParams;
    return execQueryPaignation(query, page, limit);
  }

  async assignUsers(roleId: number, dto: AssignUsersRoleDto) {
    // Validate role exists
    await this.roleRepository.findOneByIdValid(roleId);

    const userRoleRepo = this.connection.getRepository(UserRole);
    // Find existing records for these user_ids + roleId
    const existing = await userRoleRepo.find({
      where: { role_id: roleId, user_id: In(dto.user_ids) },
    });
    const existingUserIds = existing.map((ur) => ur.user_id);

    // Insert only non-existing ones
    const toInsert = dto.user_ids
      .filter((uid) => !existingUserIds.includes(uid))
      .map((uid) => userRoleRepo.create({ role_id: roleId, user_id: uid }));

    if (toInsert.length) await userRoleRepo.save(toInsert);

    return { added: toInsert.length, total: dto.user_ids.length };
  }

  async removeUsers(roleId: number, dto: AssignUsersRoleDto) {
    // Validate role exists
    await this.roleRepository.findOneByIdValid(roleId);

    const userRoleRepo = this.connection.getRepository(UserRole);
    await userRoleRepo.delete({ role_id: roleId, user_id: In(dto.user_ids) });

    return { removed: dto.user_ids.length };
  }

  async validateFormUpdate(payload: UpdateRoleDto, id: number) {
    const { sub_screen, ...data } = payload;
    // Validate role exists
    const existing = await this.roleRepository.findOne({ where: { id } });
    if (!existing) throw new NotFoundException();
    // Check name uniqueness only if name is being changed
    if (data.name !== undefined) {
      const duplicate = await this.roleRepository.findOneByCondition({ id: Not(id), name: data.name });
      if (duplicate) throw new BadRequestException(MODEL_ROLE_NAME_EXISTS);
    }
    data.screen = (data.screen ?? []).concat(sub_screen ?? []);
    return data;
  }

  async update(id: number, payload: UpdateRoleDto) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { permission, permission_ids, user_ids, screen: _screen, sub_screen: _sub_screen, ...data } = payload;

    // permission_ids (new field) takes priority over permission (legacy CreateRoleDto field)
    const finalPermIds = permission_ids ?? (permission ? permission : undefined);
    const hasPermChange = finalPermIds !== undefined;
    const hasUserChange = user_ids !== undefined;
    const hasFieldChange = Object.keys(data).length > 0;

    // Validate permission IDs if provided
    if (hasPermChange && finalPermIds.length > 0) {
      const validPerms = await this.permissionRepository.find({ where: { is_active: true }, select: ['id'] });
      const validIds = new Set(validPerms.map((p) => p.id));
      const invalidIds = finalPermIds.filter((pid) => !validIds.has(pid));
      if (invalidIds.length > 0) throw new BadRequestException(`Invalid permission IDs: ${invalidIds.join(', ')}`);
    }

    // Validate user IDs if provided
    if (hasUserChange && user_ids.length > 0) {
      const validUsers = await this.userRepository.find({ where: { id: In(user_ids) }, select: ['id'] });
      if (validUsers.length !== user_ids.length) {
        const validSet = new Set(validUsers.map((u) => u.id));
        const invalidIds = user_ids.filter((uid) => !validSet.has(uid));
        throw new BadRequestException(`Invalid user IDs: ${invalidIds.join(', ')}`);
      }
    }

    // Single transaction for all changes
    await this.connection.transaction(async (manager) => {
      // 1. Update role fields (name, description, status, etc.)
      if (hasFieldChange) {
        await manager.save(this.roleRepository.target, { id, ...data });
      }

      // 2. Replace permissions if provided
      if (hasPermChange) {
        await manager.createQueryBuilder().delete().from('roles_permissions').where('role_id = :id', { id }).execute();
        if (finalPermIds.length > 0) {
          await manager.createQueryBuilder().insert().into('roles_permissions')
            .values(finalPermIds.map((pid) => ({ role_id: id, permission_id: pid })))
            .execute();
        }
      }

      // 3. Replace user assignments if provided
      if (hasUserChange) {
        await manager.createQueryBuilder().delete().from('user_roles').where('role_id = :id', { id }).execute();
        if (user_ids.length > 0) {
          await manager.createQueryBuilder().insert().into('user_roles')
            .values(user_ids.map((uid) => ({ role_id: id, user_id: uid })))
            .execute();
        }
      }
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
    return { id };
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
