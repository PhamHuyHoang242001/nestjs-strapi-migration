import { DataAccess } from '@modules/databases/data-access.entity';
import { Injectable } from '@nestjs/common';
import { Seeder } from 'nestjs-seeder';
import { DataSource } from 'typeorm';

@Injectable()
export class DataAccessSeeder implements Seeder {
  constructor(private connection: DataSource) {}

  private dataRef: number[] = [];

  async seed(): Promise<any> {
    // data_id references actual record IDs from BusinessTableSampleSeeder
    const dataConfig = [
      { id: 1, data_id: 1, module_id: 7, scope_type: 'allow', start_date: null, end_date: null },
      { id: 2, data_id: 2, module_id: 7, scope_type: 'allow', start_date: null, end_date: null },
      { id: 3, data_id: 1, module_id: 4, scope_type: 'allow', start_date: null, end_date: null },
      { id: 4, data_id: 2, module_id: 4, scope_type: 'allow', start_date: null, end_date: null },
      { id: 5, data_id: 1, module_id: 3, scope_type: 'allow', start_date: null, end_date: null },
      { id: 6, data_id: 3, module_id: 4, scope_type: 'deny', start_date: null, end_date: null },
      { id: 7, data_id: 3, module_id: 7, scope_type: 'allow', start_date: '2026-01-01', end_date: '2026-12-31' },
      { id: 8, data_id: 4, module_id: 7, scope_type: 'allow', start_date: '2026-01-01', end_date: '2026-12-31' },
      { id: 9, data_id: 5, module_id: 7, scope_type: 'allow', start_date: null, end_date: null },
      { id: 10, data_id: 4, module_id: 4, scope_type: 'deny', start_date: null, end_date: null },
      { id: 11, data_id: 5, module_id: 4, scope_type: 'allow', start_date: '2026-04-01', end_date: '2026-04-30' },
      { id: 12, data_id: 6, module_id: 4, scope_type: 'allow', start_date: '2026-04-15', end_date: '2026-05-15' },
    ];

    for (const item of dataConfig) {
      this.dataRef.push(item.id);
    }

    const tableName = this.connection.getMetadata(DataAccess).tableName;
    const existing = await this.connection.query<{ id: number }[]>(
      `SELECT * FROM ${tableName} WHERE "id" = ANY($1)`,
      [this.dataRef],
    );

    const arrDataInit = [];
    for (const item of dataConfig) {
      if (!existing.find((r: { id: number }) => r.id == item.id)) arrDataInit.push(item);
    }

    if (arrDataInit.length) {
      await this.connection.createQueryBuilder().insert().into(DataAccess).values(arrDataInit).execute();
      await this.connection.query(
        `SELECT setval('data_access_id_seq', (SELECT COALESCE(MAX(id), 1) FROM ${tableName}))`,
      );
    }

    await this.seedJunctionTables();
  }

  private async seedJunctionTables(): Promise<void> {
    await this.seedDataAccessRoles();
    await this.seedDataAccessUsers();
  }

  private async seedDataAccessRoles(): Promise<void> {
    const existing = await this.connection.query<{ data_access_id: number; role_id: number }[]>(
      `SELECT data_access_id, role_id FROM data_access_roles WHERE data_access_id = ANY($1)`,
      [this.dataRef],
    );
    if (existing.length > 0) return;

    await this.connection.query(`
      INSERT INTO data_access_roles (data_access_id, role_id) VALUES
      (1, 1), (1, 2), (1, 4),
      (2, 1), (2, 2),
      (3, 1), (4, 1), (5, 1),
      (6, 2),
      (7, 3), (8, 3)
    `);
  }

  private async seedDataAccessUsers(): Promise<void> {
    const existing = await this.connection.query<{ data_access_id: number; user_id: number }[]>(
      `SELECT data_access_id, user_id FROM data_access_users WHERE data_access_id = ANY($1)`,
      [this.dataRef],
    );
    if (existing.length > 0) return;

    await this.connection.query(`
      INSERT INTO data_access_users (data_access_id, user_id, permission_id) VALUES
      (9, 3, 23), (10, 4, 14), (11, 2, 12), (12, 3, 13)
    `);
  }

  async drop(): Promise<any> {
    if (!this.dataRef.length) return;
    await this.connection.query(`DELETE FROM data_access_users WHERE data_access_id = ANY($1)`, [this.dataRef]);
    await this.connection.query(`DELETE FROM data_access_roles WHERE data_access_id = ANY($1)`, [this.dataRef]);
    await this.connection
      .createQueryBuilder()
      .delete()
      .from(DataAccess)
      .where('"id" IN (:...ids)', { ids: this.dataRef })
      .execute();
  }
}
