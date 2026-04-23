import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { getNameColumn, HIERARCHY_MAP } from './constants/hierarchy-config';

/** Structured response for missing ancestor rules */
export interface MissingAncestorGroup {
  table_name: string;
  items: { data_id: number; display_name: string }[];
}

@Injectable()
export class HierarchyValidationService {
  constructor(private readonly connection: DataSource) {}

  /**
   * Throws BadRequestException with structured error if hierarchy validation fails.
   */
  async enforce(dataIds: number[], tableName: string, userIds: number[], roleIds: number[]): Promise<void> {
    const missing = await this.validate(dataIds, tableName, userIds, roleIds);
    if (missing.length > 0) {
      throw new BadRequestException({
        message: 'missing_parent_access_rules',
        data: { table_name: tableName, missing_ancestors: missing },
      });
    }
  }

  /**
   * Walks up the hierarchy chain for given records.
   * Returns MissingAncestorGroup[] if any ancestor lacks allow rules
   * for the specified users/roles. Returns empty array if all OK.
   */
  async validate(
    dataIds: number[],
    tableName: string,
    userIds: number[],
    roleIds: number[],
  ): Promise<MissingAncestorGroup[]> {
    const hierarchy = HIERARCHY_MAP[tableName];
    if (!hierarchy) return [];

    const { parentTable, fkColumn } = hierarchy;

    // Defense-in-depth: validate column name is safe for interpolation
    if (!/^[a-z_]+$/.test(fkColumn)) return [];

    // Step 1: Get parent IDs for all data_ids in single query
    const fkPlaceholders = dataIds.map((_, i) => `$${i + 1}`).join(',');
    const fkRows: { id: number; parent_id: number }[] = await this.connection.query(
      `SELECT id, "${fkColumn}" as parent_id FROM "${tableName}" WHERE id IN (${fkPlaceholders}) AND deleted_at IS NULL`,
      dataIds,
    );

    const parentIds = [...new Set(fkRows.map((r) => r.parent_id).filter((id) => id != null))];
    if (parentIds.length === 0) return [];

    // Step 2: Check which parents have existing allow rules for same user/role
    const params: any[] = [...parentIds];
    const parentPlaceholders = parentIds.map((_, i) => `$${i + 1}`).join(',');
    let paramIndex = parentIds.length;

    let userRoleCondition = '';
    if (userIds.length > 0 && roleIds.length > 0) {
      const userPh = userIds.map((_, i) => `$${paramIndex + i + 1}`).join(',');
      paramIndex += userIds.length;
      const rolePh = roleIds.map((_, i) => `$${paramIndex + i + 1}`).join(',');
      paramIndex += roleIds.length;
      params.push(...userIds, ...roleIds);
      userRoleCondition = `AND (dau.user_id IN (${userPh}) OR dar.role_id IN (${rolePh}))`;
    } else if (userIds.length > 0) {
      const userPh = userIds.map((_, i) => `$${paramIndex + i + 1}`).join(',');
      paramIndex += userIds.length;
      params.push(...userIds);
      userRoleCondition = `AND dau.user_id IN (${userPh})`;
    } else if (roleIds.length > 0) {
      const rolePh = roleIds.map((_, i) => `$${paramIndex + i + 1}`).join(',');
      paramIndex += roleIds.length;
      params.push(...roleIds);
      userRoleCondition = `AND dar.role_id IN (${rolePh})`;
    }

    params.push(parentTable);
    const tableParam = `$${params.length}`;

    const existingRules: { data_id: number }[] = await this.connection.query(
      `SELECT DISTINCT da.data_id FROM data_access da
       LEFT JOIN data_access_users dau ON da.id = dau.data_access_id
       LEFT JOIN data_access_roles dar ON da.id = dar.data_access_id
       WHERE da.table_name = ${tableParam}
         AND da.data_id IN (${parentPlaceholders})
         AND da.scope_type = 'allow'
         AND da.deleted_at IS NULL
         ${userRoleCondition}`,
      params,
    );

    const existingIds = new Set(existingRules.map((r) => r.data_id));
    const missingParentIds = parentIds.filter((id) => !existingIds.has(id));
    if (missingParentIds.length === 0) return [];

    // Step 3: Get display names for missing parents
    const parentNameCol = getNameColumn(parentTable);
    const missingPh = missingParentIds.map((_, i) => `$${i + 1}`).join(',');
    const missingRows: { id: number; display_name: string }[] = await this.connection.query(
      `SELECT id, "${parentNameCol}" as display_name FROM "${parentTable}" WHERE id IN (${missingPh}) AND deleted_at IS NULL`,
      missingParentIds,
    );

    const currentLevel: MissingAncestorGroup = {
      table_name: parentTable,
      items: missingRows.map((r) => ({
        data_id: r.id,
        display_name: r.display_name || `ID: ${r.id}`,
      })),
    };

    // Step 4: Recurse up for grandparent check
    const upperMissing = await this.validate(missingParentIds, parentTable, userIds, roleIds);

    // Return grandparent first, then parent (top-down order)
    return [...upperMissing, currentLevel];
  }
}
