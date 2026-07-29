import { SCOPE_TYPE } from '@common/enums';
import { PermissionCacheService } from '@common/authorization';
import { DataAccess, UserDataAccess } from '@modules/databases/data-access.entity';
import { Module as ModuleEntity } from '@modules/databases/module.entity';
import { Permission } from '@modules/databases/permission.entity';
import { Injectable, Logger } from '@nestjs/common';
import { EntityManager, In, IsNull } from 'typeorm';

/** Actions to grant the record creator (intersected with module's actual permissions) */
export const CREATOR_ACTIONS = ['read', 'update', 'delete'];

@Injectable()
export class CreatorAccessGrantService {
  private readonly logger = new Logger(CreatorAccessGrantService.name);

  constructor(private readonly permissionCache: PermissionCacheService) {}

  /**
   * Auto-grant the record creator RUD data-access on the newly created record.
   * Must be called inside the caller's transaction (pass the transaction EntityManager).
   * No-op when module has no matching RUD permissions.
   *
   * Returns true if rows were created (caller should invalidate cache AFTER commit).
   */
  async grantCreatorAccess(
    manager: EntityManager,
    params: {
      tableName: string;
      dataId: number;
      userId: number;
    },
  ): Promise<boolean> {
    const { tableName, dataId, userId } = params;

    // Find module by table_name
    const mod = await manager.findOne(ModuleEntity, {
      where: { table_name: tableName, is_active: true, deleted_at: IsNull() },
    });
    if (!mod) {
      this.logger.warn(`grantCreatorAccess: module not found for table "${tableName}"`);
      return false;
    }

    // Find RUD permissions available for this module
    const permissions = await manager.find(Permission, {
      where: {
        module_id: mod.id,
        action: In(CREATOR_ACTIONS),
        is_active: true,
        deleted_at: IsNull(),
      },
    });
    if (!permissions.length) return false;

    // Create DataAccess record (allow scope, no date bounds)
    const dataAccess = manager.create(DataAccess, {
      data_id: dataId,
      module_id: mod.id,
      scope_type: SCOPE_TYPE.ALLOW,
    });
    const saved = await manager.save(dataAccess);

    // Bulk-insert UserDataAccess junction rows (1 per permission)
    const rows = permissions.map((perm) => ({
      user_id: userId,
      data_access_id: saved.id,
      permission_id: perm.id,
    }));
    await manager.insert(UserDataAccess, rows);

    return true;
  }

  /** Invalidate permission cache for a user. Call AFTER transaction commits. */
  async invalidateUserCache(userId: number): Promise<void> {
    await this.permissionCache.invalidateUser(userId);
  }
}
