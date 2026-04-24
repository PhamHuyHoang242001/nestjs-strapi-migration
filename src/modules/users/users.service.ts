import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource, In, Not } from 'typeorm';
import { UserRepository } from './repository/users.repository';
import { SearchingUserDto } from './dto';
import { PageDto, PageMetaDto } from '@common/dto/paginate.dto';
import { UserAddressRepository } from './repository/users-address.repository';
import { SearchUserAddressDto } from './dto/search-user-address.dto';
import { Users } from '@modules/databases/user.entity';
import { UpdateMyProfileDto, UserProfileDto } from './dto/user-profile.dto';
import { DeleteMyAccountDto } from './dto/delete-my-account.dto';
import { USER_STATUS } from '@common/enums';
import { ERROR_CODE } from '@constant/error-code';
import { AuthService } from '@modules/auth/auth.service';
import { TokenRepository } from '@modules/token/repository/token.repository';
import { DayJS } from '@common/utils/dayjs';
import { SearchUserManagementDto } from './dto/search-user-management.dto';
import { CreateUserManagementDto } from './dto/create-user-management.dto';
import { UpdateUserManagementDto } from './dto/update-user-management.dto';
import { BulkAssignRoleDto, BulkUserActionDto } from './dto/bulk-user-action.dto';
import { UserRole } from '@modules/databases/user-role.entity';
import { Role } from '@modules/databases/role.entity';
import { ChangeHistory } from '@modules/databases/change-history.entity';
import { DataAccess } from '@modules/databases/data-access.entity';
import { execQueryPaignation } from '@common/utils/common';
import { PaginationParams } from '@common/decorators/pagination.decorator';
import { SortParams } from '@common/decorators/sort.decorator';
import { ChangeHistoryLogger } from '@modules/change-history/change-history-logger.service';
import { CHANGE_ACTION_TYPE, CHANGE_ENTITY_TYPE } from '@common/enums';

@Injectable()
export class UsersService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly userAddressRepository: UserAddressRepository,
    private readonly tokenRepository: TokenRepository,
    private readonly authService: AuthService,
    private readonly dataSource: DataSource,
    private readonly historyLogger: ChangeHistoryLogger,
  ) {}

  findUsingSocialId({ apple_id, google_id }: { apple_id?: string | null; google_id?: string | null }) {
    if (!google_id && !apple_id) {
      throw new Error('Invalid parameters given');
    } else if (apple_id && google_id) {
      throw new Error('Provide only one parameter');
    }

    return this.userRepository.findOneByCondition({
      apple_id,
      google_id,
    });
  }

  async findAll(query: SearchingUserDto) {
    const { page, limit } = query;
    const { entities, itemCount } = await this.userRepository.findAll(query);
    const pageMetaDto = new PageMetaDto({ itemCount, page, limit });
    return new PageDto(entities, pageMetaDto);
  }

  async findOne(user_id: number): Promise<Record<string, unknown> | undefined> {
    return this.userRepository.findUserProfileById(user_id);
  }

  async getListOrderAddress(query: SearchUserAddressDto) {
    const { page, limit } = query;
    const { entities, itemCount } = await this.userAddressRepository.findAll(query);
    const pageMetaDto = new PageMetaDto({ itemCount, page, limit });
    return new PageDto(entities, pageMetaDto);
  }

  getMyProfile(user: Users): UserProfileDto {
    const {
      id,
      first_name,
      last_name,
      email,
      phone_code,
      phone,
      date_of_birth,
      country,
      country_iso,
      phone_iso,
      state,
      state_iso,
      gender,
      password,
    } = user;

    return {
      id,
      first_name,
      last_name,
      email,
      phone_code,
      phone,
      date_of_birth,
      country,
      country_iso,
      phone_iso,
      state,
      state_iso,
      gender,
      social_link: password ? false : true,
    };
  }

  async updateMyProfile(user: Users, body: UpdateMyProfileDto): Promise<UserProfileDto> {
    const { id: userId, email: currentEmail, password } = user;
    const {
      country_iso,
      state_iso,
      phone,
      phone_code,
      email,
      date_of_birth: dateOfBirth,
      first_name: firstName,
      last_name: lastName,
    } = body;

    // firstname & lastname is require
    if (!firstName) delete body.first_name;
    if (!lastName) delete body.last_name;

    // only sso users can update their email
    const isSocialUser = password ? false : true;
    if (!isSocialUser || currentEmail) {
      delete body.email;
    }

    const { validCountry, validState } = await this.authService.validateAddress(
      country_iso,
      state_iso,
      phone,
      phone_code,
    );

    if (validCountry) {
      const country = validCountry as Record<string, unknown>;
      Object.assign(body, { country: country['name'] as string, country_iso });
    }
    if (validState) {
      const state = validState as Record<string, unknown>;
      Object.assign(body, { state: state['name'] as string, state_iso });
    }

    if (email) {
      const existedUser = await this.userRepository.findOne({ where: { email, id: Not(userId) } });
      if (existedUser) {
        throw new BadRequestException(ERROR_CODE.A009);
      }
    }
    if (dateOfBirth) {
      const currentTime = DayJS().utc().startOf('day');
      const dob = DayJS(dateOfBirth).utc().startOf('day');
      if (dob.isAfter(currentTime)) {
        throw new BadRequestException(`Date of birth can't be in the future.`);
      }
      body.date_of_birth = dob.format('YYYY-MM-DD');
    }

    const updateResult = await this.userRepository.updateUserProfile(userId, body);
    const updatedUser: Users = (updateResult.raw as Users[])[0];

    return this.getMyProfile(updatedUser);
  }

  async deleteMyAccount(user: Users, body: DeleteMyAccountDto): Promise<{ user_id: number }> {
    const { id: userId, status } = user;
    const { reason } = body;

    if (status !== USER_STATUS.ACTIVE) {
      throw new BadRequestException(ERROR_CODE.A009);
    }

    // delete my account
    await this.userRepository.deleteMyAccount(userId, reason);

    // delete tokens
    await this.tokenRepository.destroyAllUserTokens(userId);

    return {
      user_id: userId,
    };
  }

  findOneByEmail(email: string) {
    return this.userRepository.findOneBy({ email });
  }

  // ─── Admin Management Methods ─────────────────────────────────────────────

  /** Paginated admin user search with filters and sorting. */
  async searchAdmin(dto: SearchUserManagementDto, sortParams: SortParams, pagination: PaginationParams) {
    const query = this.userRepository.buildAdminQueryBuilder(dto, sortParams);
    const result = await execQueryPaignation(query, pagination.page, pagination.limit);
    result.data = result.data.map((user: any) => this.formatAdminUser(user));
    return result;
  }

  /** Flatten user_roles into roles array and strip junction table fields. */
  private formatAdminUser(user: any) {
    const roles = (user.user_roles || [])
      .map((ur: any) => ur.role)
      .filter(Boolean)
      .map((r: any) => ({ id: r.id, name: r.name, code: r.code }));
    const { user_roles, ...rest } = user;
    return { ...rest, roles };
  }

  /** Detailed user view including roles, permission exceptions, and change history. */
  async detailAdmin(id: number) {
    const user = await this.userRepository.findOne({
      where: { id },
      select: ['id', 'username', 'full_name', 'email', 'department', 'branch_code', 'region', 'is_active', 'created_at', 'updated_at'],
      relations: ['user_roles', 'user_roles.role'],
    });
    if (!user) throw new BadRequestException(ERROR_CODE.A009);

    const exceptions = await this.dataSource
      .getRepository(DataAccess)
      .createQueryBuilder('da')
      .leftJoinAndSelect('da.users', 'users')
      .leftJoinAndSelect('da.permissions', 'permissions')
      .where('users.id = :userId', { userId: id })
      .orderBy('da.id', 'DESC')
      .getMany();

    const recentHistory = await this.dataSource
      .getRepository(ChangeHistory)
      .find({ order: { created_at: 'DESC' }, take: 20 });

    return { ...this.formatAdminUser(user), exceptions, recent_history: recentHistory };
  }

  /** Create a new user with optional role assignments. */
  async createAdmin(dto: CreateUserManagementDto) {
    const { role_ids, ...userData } = dto;

    const existing = await this.userRepository.findOneBy({ username: userData.username });
    if (existing) throw new BadRequestException(`Username '${userData.username}' already exists`);

    const user = this.userRepository.create({ ...userData, is_active: userData.is_active ?? true });
    const savedUser = await this.userRepository.save(user);

    if (role_ids?.length) {
      const userRoleRepo = this.dataSource.getRepository(UserRole);
      const roles = role_ids.map((role_id) => userRoleRepo.create({ user_id: savedUser.id, role_id }));
      await userRoleRepo.save(roles);
    }

    this.historyLogger.log({
      entity_type: CHANGE_ENTITY_TYPE.USER,
      action_type: CHANGE_ACTION_TYPE.CREATE,
      entity_id: String(savedUser.id),
      entity_name: savedUser.username,
      performed_by: 'system',
      old_value: null,
      new_value: {
        username: userData.username,
        full_name: userData.full_name,
        email: userData.email,
        department: userData.department,
        roles: role_ids?.length
          ? (await this.dataSource.getRepository(Role).find({ where: { id: In(role_ids) }, select: ['id', 'name'] })).map((r) => r.name)
          : [],
      },
    }).catch(() => {});

    return { id: savedUser.id };
  }

  /** Update user fields and sync role assignments if role_ids provided. */
  async updateAdmin(id: number, dto: UpdateUserManagementDto) {
    const user = await this.userRepository.findOneByIdValid(id);
    const { role_ids, ...userData } = dto;

    if (userData.username && userData.username !== user.username) {
      const existing = await this.userRepository.findOne({ where: { username: userData.username, id: Not(id) } });
      if (existing) throw new BadRequestException(`Username '${userData.username}' already exists`);
    }

    // Capture old values before mutation for diff logging
    const oldSnapshot: Record<string, unknown> = {};
    const newSnapshot: Record<string, unknown> = {};
    for (const key of Object.keys(userData) as (keyof typeof userData)[]) {
      if (user[key as keyof typeof user] !== (userData as any)[key]) {
        oldSnapshot[key] = user[key as keyof typeof user];
        newSnapshot[key] = (userData as any)[key];
      }
    }

    Object.assign(user, userData);
    await this.userRepository.save(user);

    if (role_ids !== undefined) {
      const userRoleRepo = this.dataSource.getRepository(UserRole);
      // Capture old role names before delete for diff
      const oldRoleLinks = await userRoleRepo.findBy({ user_id: id });
      const oldRoleIds = oldRoleLinks.map((ur) => ur.role_id);
      const roleRepo = this.dataSource.getRepository(Role);
      const oldRoleEntities = oldRoleIds.length ? await roleRepo.find({ where: { id: In(oldRoleIds) }, select: ['id', 'name'] }) : [];
      const newRoleEntities = role_ids.length ? await roleRepo.find({ where: { id: In(role_ids) }, select: ['id', 'name'] }) : [];
      oldSnapshot['roles'] = oldRoleEntities.map((r) => r.name);
      newSnapshot['roles'] = newRoleEntities.map((r) => r.name);

      // Remove all existing roles then re-insert
      await userRoleRepo.delete({ user_id: id });
      if (role_ids.length) {
        const roles = role_ids.map((role_id) => userRoleRepo.create({ user_id: id, role_id }));
        await userRoleRepo.save(roles);
      }
    }

    this.historyLogger.log({
      entity_type: CHANGE_ENTITY_TYPE.USER,
      action_type: CHANGE_ACTION_TYPE.UPDATE,
      entity_id: String(id),
      entity_name: user.username,
      performed_by: 'system',
      old_value: Object.keys(oldSnapshot).length ? oldSnapshot : null,
      new_value: Object.keys(newSnapshot).length ? newSnapshot : null,
    }).catch(() => {});

    return { id };
  }

  /** Toggle is_active flag for a single user. */
  async toggleActive(id: number) {
    const user = await this.userRepository.findOneByIdValid(id);
    user.is_active = !user.is_active;
    await this.userRepository.save(user);

    this.historyLogger.log({
      entity_type: CHANGE_ENTITY_TYPE.USER,
      action_type: user.is_active ? CHANGE_ACTION_TYPE.ACTIVATE : CHANGE_ACTION_TYPE.DEACTIVATE,
      entity_id: String(id),
      entity_name: user.username,
      performed_by: 'system',
      old_value: { is_active: !user.is_active },
      new_value: { is_active: user.is_active },
    }).catch(() => {});

    return { id, is_active: user.is_active };
  }

  /** Soft-delete a user (uses TypeORM soft delete from BaseSoftDeleteEntity). */
  async deleteAdmin(id: number) {
    const user = await this.userRepository.findOneByIdValid(id);
    await this.userRepository.softDelete(id);

    this.historyLogger.log({
      entity_type: CHANGE_ENTITY_TYPE.USER,
      action_type: CHANGE_ACTION_TYPE.DELETE,
      entity_id: String(id),
      entity_name: user.username,
      performed_by: 'system',
      old_value: { username: user.username, full_name: user.full_name, email: user.email },
      new_value: null,
    }).catch(() => {});

    return { user_id: id };
  }

  /** Toggle is_active for each user in the list. */
  async bulkToggleActive(dto: BulkUserActionDto) {
    const users = await this.userRepository.findBy({ id: In(dto.user_ids) });
    const updated = users.map((u) => ({ ...u, is_active: !u.is_active }));
    await this.userRepository.save(updated);

    this.historyLogger.log({
      entity_type: CHANGE_ENTITY_TYPE.USER,
      action_type: CHANGE_ACTION_TYPE.ACTIVATE,
      entity_id: 'bulk',
      entity_name: 'bulk toggle active',
      performed_by: 'system',
      old_value: null,
      new_value: { user_ids: dto.user_ids, toggled: updated.length },
    }).catch(() => {});

    return { toggled: updated.length };
  }

  /** Assign a role to multiple users, skipping existing assignments. */
  async bulkAssignRole(dto: BulkAssignRoleDto) {
    const userRoleRepo = this.dataSource.getRepository(UserRole);
    const roleRepo = this.dataSource.getRepository(Role);
    const role = await roleRepo.findOne({ where: { id: dto.role_id }, select: ['id', 'name'] });

    // Capture old user list for this role
    const oldLinks = await userRoleRepo.findBy({ role_id: dto.role_id });
    const oldUserIds = oldLinks.map((ur) => ur.user_id);
    const oldUsers = oldUserIds.length ? await this.userRepository.find({ where: { id: In(oldUserIds) }, select: ['id', 'username'] }) : [];

    const existing = await userRoleRepo.findBy({ user_id: In(dto.user_ids), role_id: dto.role_id });
    const existingUserIds = new Set(existing.map((ur) => ur.user_id));
    const toInsert = dto.user_ids
      .filter((uid) => !existingUserIds.has(uid))
      .map((user_id) => userRoleRepo.create({ user_id, role_id: dto.role_id }));
    if (toInsert.length) await userRoleRepo.save(toInsert);

    // Capture new user list after change
    const newLinks = await userRoleRepo.findBy({ role_id: dto.role_id });
    const newUserIds = newLinks.map((ur) => ur.user_id);
    const newUsers = newUserIds.length ? await this.userRepository.find({ where: { id: In(newUserIds) }, select: ['id', 'username'] }) : [];

    this.historyLogger.log({
      entity_type: CHANGE_ENTITY_TYPE.ROLE_USER,
      action_type: CHANGE_ACTION_TYPE.ASSIGN_USER,
      entity_id: String(dto.role_id),
      entity_name: role?.name || String(dto.role_id),
      performed_by: 'system',
      old_value: { users: oldUsers.map((u) => u.username) },
      new_value: { users: newUsers.map((u) => u.username) },
    }).catch(() => {});

    return { assigned: toInsert.length, skipped: existing.length };
  }

  /** Remove a specific role from multiple users. */
  async bulkRemoveRole(dto: BulkAssignRoleDto) {
    const userRoleRepo = this.dataSource.getRepository(UserRole);
    const roleRepo = this.dataSource.getRepository(Role);
    const role = await roleRepo.findOne({ where: { id: dto.role_id }, select: ['id', 'name'] });

    // Capture old user list before delete
    const oldLinks = await userRoleRepo.findBy({ role_id: dto.role_id });
    const oldUserIds = oldLinks.map((ur) => ur.user_id);
    const oldUsers = oldUserIds.length ? await this.userRepository.find({ where: { id: In(oldUserIds) }, select: ['id', 'username'] }) : [];

    const result = await userRoleRepo.delete({ user_id: In(dto.user_ids), role_id: dto.role_id });

    // Capture new user list after delete
    const newLinks = await userRoleRepo.findBy({ role_id: dto.role_id });
    const newUserIds = newLinks.map((ur) => ur.user_id);
    const newUsers = newUserIds.length ? await this.userRepository.find({ where: { id: In(newUserIds) }, select: ['id', 'username'] }) : [];

    this.historyLogger.log({
      entity_type: CHANGE_ENTITY_TYPE.ROLE_USER,
      action_type: CHANGE_ACTION_TYPE.REMOVE_USER,
      entity_id: String(dto.role_id),
      entity_name: role?.name || String(dto.role_id),
      performed_by: 'system',
      old_value: { users: oldUsers.map((u) => u.username) },
      new_value: { users: newUsers.map((u) => u.username) },
    }).catch(() => {});

    return { removed: result.affected ?? 0 };
  }
}
