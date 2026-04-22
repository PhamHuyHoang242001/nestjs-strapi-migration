import { NOT_FOUND } from '@constant/error-messages';
import { Module as ModuleEntity } from '@modules/databases/module.entity';
import { ModuleManagementRepository } from '@modules/module/repository/module-management.repository';
import { PermissionRepository } from '@modules/permission/repository/permission.repository';
import { RoleRepository } from '@modules/role/repository/role.repository';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { STATUS } from '@common/enums';
import { DataSource } from 'typeorm';
import { UpdatePermissionMatrixDto } from './dto/update-permission-matrix.dto';

/** Node in the module tree with permissions annotated by checked state */
export interface PermissionNode {
  id: number;
  action: string;
  name: string;
  checked: boolean;
}

export interface ModuleTreeNode {
  id: number;
  name: string;
  children: ModuleTreeNode[];
  permissions: PermissionNode[];
}

@Injectable()
export class PermissionMatrixService {
  constructor(
    private readonly roleRepository: RoleRepository,
    private readonly permissionRepository: PermissionRepository,
    private readonly moduleRepository: ModuleManagementRepository,
    private readonly connection: DataSource,
  ) {}

  /**
   * Returns the permission matrix grid for a given role.
   * Uses TreeRepository.findTrees() then annotates permissions as checked/unchecked.
   */
  async getMatrixForRole(roleId: number) {
    const role = await this.roleRepository.findOne({
      where: { id: roleId },
      relations: ['permissions'],
    });
    if (!role) throw new NotFoundException(NOT_FOUND);

    const rolePermissionIds = new Set((role.permissions ?? []).map((p) => p.id));

    // All active permissions with their module relation
    const allPermissions = await this.permissionRepository.find({
      where: { is_active: true },
      relations: ['module'],
    });

    // Get full module tree via TreeRepository
    const trees = await this.moduleRepository.findTrees();

    // Build permission map by module_id
    const permsByModule = new Map<number, PermissionNode[]>();
    for (const perm of allPermissions) {
      if (!perm.module_id) continue;
      if (!permsByModule.has(perm.module_id)) permsByModule.set(perm.module_id, []);
      const modulePerms = permsByModule.get(perm.module_id);
      if (modulePerms) {
        modulePerms.push({
          id: perm.id,
          action: perm.action,
          name: perm.name,
          checked: rolePermissionIds.has(perm.id),
        });
      }
    }

    // Recursively annotate tree nodes with permissions
    const annotate = (mod: ModuleEntity): ModuleTreeNode => ({
      id: mod.id,
      name: mod.name,
      children: (mod.children ?? []).map(annotate),
      permissions: permsByModule.get(mod.id) ?? [],
    });

    const modules = trees.map(annotate);

    // Collect unique action labels for column headers
    const actionsSet = new Set<string>();
    for (const perm of allPermissions) {
      actionsSet.add(perm.action);
    }

    return {
      role: { id: role.id, name: role.name, code: role.code },
      modules,
      actions: Array.from(actionsSet),
    };
  }

  /**
   * Replaces all permissions for a role using a single transaction:
   * deletes existing mappings, then inserts new ones.
   */
  async updateMatrixForRole(roleId: number, dto: UpdatePermissionMatrixDto) {
    const role = await this.roleRepository.findOne({ where: { id: roleId } });
    if (!role) throw new NotFoundException(NOT_FOUND);

    // Validate all permission IDs exist and are active
    const validPermissions = await this.permissionRepository.find({
      where: { is_active: true },
      select: ['id'],
    });
    const validIds = new Set(validPermissions.map((p) => p.id));
    const invalidIds = dto.permission_ids.filter((id) => !validIds.has(id));
    if (invalidIds.length > 0) {
      throw new BadRequestException(`Invalid permission IDs: ${invalidIds.join(', ')}`);
    }

    await this.connection.transaction(async (manager) => {
      await manager
        .createQueryBuilder()
        .delete()
        .from('roles_permissions')
        .where('role_id = :roleId', { roleId })
        .execute();

      if (dto.permission_ids.length > 0) {
        await manager
          .createQueryBuilder()
          .insert()
          .into('roles_permissions')
          .values(dto.permission_ids.map((pid) => ({ role_id: roleId, permission_id: pid })))
          .execute();
      }
    });

    return { id: roleId };
  }

  /**
   * Returns a summary: all active roles with their permission counts,
   * total module count, and total permission count.
   */
  async getSummary() {
    const roles = await this.roleRepository.find({
      where: { status: STATUS.ACTIVE },
      relations: ['permissions'],
    });

    const totalPermissions = await this.permissionRepository.count({ where: { is_active: true } });
    const moduleCount = await this.moduleRepository.count();

    const roleSummaries = roles.map((r) => ({
      id: r.id,
      name: r.name,
      code: r.code,
      permission_count: (r.permissions ?? []).length,
      total_permissions: totalPermissions,
    }));

    return {
      roles: roleSummaries,
      module_count: moduleCount,
      permission_count: totalPermissions,
    };
  }
}
