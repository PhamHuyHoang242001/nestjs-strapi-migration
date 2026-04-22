import { Role } from '@modules/databases/role.entity';
import { Injectable } from '@nestjs/common';
import { Seeder } from 'nestjs-seeder';
import { DataSource } from 'typeorm';

@Injectable()
export class RoleSeeder implements Seeder {
  constructor(private connection: DataSource) {}

  private dataRef: number[] = [];

  async seed(): Promise<any> {
    const dataConfig = [
      {
        id: 1,
        code: 'SUPER_ADMIN',
        name: 'Super Admin',
        description: 'Toàn quyền hệ thống',
        status: 'active',
        user_id: 1,
      },
      {
        id: 2,
        code: 'DEPT_MANAGER',
        name: 'Department Manager',
        description: 'Quản lý cấp phòng ban',
        status: 'active',
        user_id: 1,
      },
      {
        id: 3,
        code: 'DATA_ANALYST',
        name: 'Data Analyst',
        description: 'Phân tích dữ liệu, xem báo cáo',
        status: 'active',
        user_id: 1,
      },
      { id: 4, code: 'VIEWER', name: 'Viewer', description: 'Chỉ xem, không chỉnh sửa', status: 'active', user_id: 1 },
      {
        id: 5,
        code: 'DEPRECATED',
        name: 'Old Role',
        description: 'Role cũ không còn sử dụng',
        status: 'inactive',
        user_id: 1,
      },
    ];

    for (const item of dataConfig) {
      this.dataRef.push(item.id);
    }

    const tableName = this.connection.getMetadata(Role).tableName;
    const existing = await this.connection.query<{ id: number }[]>(`SELECT * FROM ${tableName} WHERE "id" = ANY($1)`, [
      this.dataRef,
    ]);

    const arrDataInit = [];
    for (const item of dataConfig) {
      if (!existing.find((r: { id: number }) => r.id == item.id)) arrDataInit.push(item);
    }

    if (arrDataInit.length) {
      for (const item of arrDataInit) {
        await this.connection.query(
          `INSERT INTO ${tableName} (id, code, name, description, status, user_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
          [item.id, item.code, item.name, item.description, item.status, item.user_id],
        );
      }
      await this.connection.query(`SELECT setval('role_id_seq', (SELECT COALESCE(MAX(id), 1) FROM ${tableName}))`);
    }

    await this.seedRolePermissions();
  }

  private async seedRolePermissions(): Promise<void> {
    const existingMappings = await this.connection.query<{ role_id: number; permission_id: number }[]>(
      `SELECT role_id, permission_id FROM roles_permissions WHERE role_id = ANY($1)`,
      [this.dataRef],
    );

    if (existingMappings.length > 0) return;

    const allPermissions = await this.connection.query<{ id: number; action: string }[]>(
      `SELECT id, action FROM permission WHERE deleted_at IS NULL`,
    );

    if (!allPermissions.length) return;

    const mappings: { role_id: number; permission_id: number }[] = [];

    for (const perm of allPermissions) {
      // Super Admin: all permissions
      mappings.push({ role_id: 1, permission_id: perm.id });

      // Dept Manager: read, create, update, upload, download, export (no delete, no approve)
      if (['read', 'create', 'update', 'upload', 'download', 'export'].includes(perm.action)) {
        mappings.push({ role_id: 2, permission_id: perm.id });
      }

      // Data Analyst: read, create, download
      if (['read', 'create', 'download'].includes(perm.action)) {
        mappings.push({ role_id: 3, permission_id: perm.id });
      }

      // Viewer: read, download
      if (['read', 'download'].includes(perm.action)) {
        mappings.push({ role_id: 4, permission_id: perm.id });
      }
    }

    if (!mappings.length) return;

    await this.connection.createQueryBuilder().insert().into('roles_permissions').values(mappings).execute();
  }

  async drop(): Promise<any> {
    if (!this.dataRef.length) return;
    await this.connection.query(`DELETE FROM roles_permissions WHERE role_id = ANY($1)`, [this.dataRef]);
    await this.connection
      .createQueryBuilder()
      .delete()
      .from(Role)
      .where('"id" IN (:...ids)', { ids: this.dataRef })
      .execute();
  }
}
