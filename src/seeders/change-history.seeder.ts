import { CHANGE_ACTION_TYPE, CHANGE_ENTITY_TYPE } from '@common/enums';
import { ChangeHistory } from '@modules/databases/change-history.entity';
import { Injectable } from '@nestjs/common';
import { Seeder } from 'nestjs-seeder';
import { DataSource } from 'typeorm';

@Injectable()
export class ChangeHistorySeeder implements Seeder {
  constructor(private connection: DataSource) {}

  private dataRef: number[] = [];

  async seed(): Promise<any> {
    const dataConfig = [
      {
        id: 1,
        entity_type: CHANGE_ENTITY_TYPE.ROLE,
        action_type: CHANGE_ACTION_TYPE.CREATE,
        entity_id: '1',
        entity_name: 'Super Admin',
        performed_by: 'admin01',
        old_value: null,
        new_value: JSON.stringify({ code: 'SUPER_ADMIN', name: 'Super Admin' }),
        description: 'Tạo role "Super Admin"',
        created_at: '2026-04-10 09:00:00',
      },
      {
        id: 2,
        entity_type: CHANGE_ENTITY_TYPE.ROLE,
        action_type: CHANGE_ACTION_TYPE.UPDATE,
        entity_id: '3',
        entity_name: 'Data Analyst',
        performed_by: 'admin01',
        old_value: JSON.stringify({ name: 'Analyst' }),
        new_value: JSON.stringify({ name: 'Data Analyst' }),
        description: 'Đổi tên role "Analyst" → "Data Analyst"',
        created_at: '2026-04-11 10:30:00',
      },
      {
        id: 3,
        entity_type: CHANGE_ENTITY_TYPE.ROLE,
        action_type: CHANGE_ACTION_TYPE.DEACTIVATE,
        entity_id: '5',
        entity_name: 'Old Role',
        performed_by: 'admin01',
        old_value: null,
        new_value: null,
        description: 'Deactivate role "Old Role"',
        created_at: '2026-04-12 14:00:00',
      },
      {
        id: 4,
        entity_type: CHANGE_ENTITY_TYPE.ROLE_USER,
        action_type: CHANGE_ACTION_TYPE.ASSIGN_USER,
        entity_id: null,
        entity_name: 'Trần Thị Manager',
        performed_by: 'admin01',
        old_value: null,
        new_value: null,
        description: 'Thêm user "Trần Thị Manager" vào role "Department Manager"',
        created_at: '2026-04-10 09:15:00',
      },
      {
        id: 5,
        entity_type: CHANGE_ENTITY_TYPE.ROLE_USER,
        action_type: CHANGE_ACTION_TYPE.ASSIGN_USER,
        entity_id: null,
        entity_name: 'Trần Thị Manager',
        performed_by: 'admin01',
        old_value: null,
        new_value: null,
        description: 'Thêm user "Trần Thị Manager" vào role "Data Analyst"',
        created_at: '2026-04-10 09:16:00',
      },
      {
        id: 6,
        entity_type: CHANGE_ENTITY_TYPE.ROLE_USER,
        action_type: CHANGE_ACTION_TYPE.REMOVE_USER,
        entity_id: null,
        entity_name: 'Hoàng Văn Inactive',
        performed_by: 'admin01',
        old_value: null,
        new_value: null,
        description: 'Bỏ user "Hoàng Văn Inactive" khỏi role "Viewer"',
        created_at: '2026-04-12 15:00:00',
      },
      {
        id: 7,
        entity_type: CHANGE_ENTITY_TYPE.USER,
        action_type: CHANGE_ACTION_TYPE.CREATE,
        entity_id: '3',
        entity_name: 'Lê Văn Analyst',
        performed_by: 'admin01',
        old_value: null,
        new_value: JSON.stringify({ username: 'analyst01', department: 'Bán lẻ' }),
        description: 'Tạo người dùng "Lê Văn Analyst"',
        created_at: '2026-04-10 08:00:00',
      },
      {
        id: 8,
        entity_type: CHANGE_ENTITY_TYPE.USER,
        action_type: CHANGE_ACTION_TYPE.DEACTIVATE,
        entity_id: '5',
        entity_name: 'Hoàng Văn Inactive',
        performed_by: 'admin01',
        old_value: null,
        new_value: null,
        description: 'Deactivate user "Hoàng Văn Inactive"',
        created_at: '2026-04-12 15:30:00',
      },
      {
        id: 9,
        entity_type: CHANGE_ENTITY_TYPE.PERMISSION,
        action_type: CHANGE_ACTION_TYPE.UPDATE,
        entity_id: null,
        entity_name: 'Data Analyst',
        performed_by: 'admin01',
        old_value: JSON.stringify({ permissions: [1, 4, 8, 12] }),
        new_value: JSON.stringify({ permissions: [1, 2, 4, 5, 8, 9, 10, 12] }),
        description: 'Cập nhật quyền role "Data Analyst": thêm create + download',
        created_at: '2026-04-11 11:00:00',
      },
      {
        id: 10,
        entity_type: CHANGE_ENTITY_TYPE.DATA_ACCESS,
        action_type: CHANGE_ACTION_TYPE.CREATE,
        entity_id: '6',
        entity_name: 'data_access#6',
        performed_by: 'admin01',
        old_value: null,
        new_value: JSON.stringify({ roles: ['Dept Manager'], data_id: 2002, scope: 'deny' }),
        description: 'DENY role "Dept Manager" truy cập data lương nhân sự',
        created_at: '2026-04-13 09:00:00',
      },
      {
        id: 11,
        entity_type: CHANGE_ENTITY_TYPE.DATA_ACCESS,
        action_type: CHANGE_ACTION_TYPE.CREATE,
        entity_id: '11',
        entity_name: 'data_access#11',
        performed_by: 'admin01',
        old_value: null,
        new_value: JSON.stringify({ users: ['manager01'], data_id: 2002, scope: 'allow', end: '2026-04-30' }),
        description: 'Ngoại lệ: ALLOW manager01 xem data lương đến 30/04/2026',
        created_at: '2026-04-14 10:00:00',
      },
      {
        id: 12,
        entity_type: CHANGE_ENTITY_TYPE.DATA_ACCESS,
        action_type: CHANGE_ACTION_TYPE.DELETE,
        entity_id: '99',
        entity_name: 'rule#99',
        performed_by: 'admin01',
        old_value: JSON.stringify({ data_id: 9999, scope: 'allow' }),
        new_value: null,
        description: 'Xóa rule report access cũ',
        created_at: '2026-04-15 16:00:00',
      },
      {
        id: 13,
        entity_type: CHANGE_ENTITY_TYPE.SYSTEM,
        action_type: CHANGE_ACTION_TYPE.CREATE,
        entity_id: null,
        entity_name: 'seed',
        performed_by: 'system',
        old_value: null,
        new_value: null,
        description: 'Khởi tạo dữ liệu mẫu',
        created_at: '2026-04-10 08:00:00',
      },
    ];

    for (const item of dataConfig) {
      this.dataRef.push(item.id);
    }

    const tableName = this.connection.getMetadata(ChangeHistory).tableName;
    const existing = await this.connection.query<{ id: number }[]>(
      `SELECT * FROM ${tableName} WHERE "id" = ANY($1)`,
      [this.dataRef],
    );

    const arrDataInit = [];
    for (const item of dataConfig) {
      if (!existing.find((r: { id: number }) => r.id == item.id)) arrDataInit.push(item);
    }

    if (!arrDataInit.length) return;

    // Use raw SQL to preserve specific created_at timestamps
    for (const item of arrDataInit) {
      await this.connection.query(
        `INSERT INTO ${tableName}
          (id, entity_type, action_type, entity_id, entity_name, performed_by, old_value, new_value, description, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          item.id,
          item.entity_type,
          item.action_type,
          item.entity_id,
          item.entity_name,
          item.performed_by,
          item.old_value,
          item.new_value,
          item.description,
          item.created_at,
        ],
      );
    }

    await this.connection.query(
      `SELECT setval('change_history_id_seq', (SELECT COALESCE(MAX(id), 1) FROM ${tableName}))`,
    );
  }

  async drop(): Promise<any> {
    if (!this.dataRef.length) return;
    await this.connection
      .createQueryBuilder()
      .delete()
      .from(ChangeHistory)
      .where('"id" IN (:...ids)', { ids: this.dataRef })
      .execute();
  }
}
