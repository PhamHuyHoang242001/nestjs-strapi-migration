import { UserRole } from '@modules/databases/user-role.entity';
import { Injectable } from '@nestjs/common';
import { Seeder } from 'nestjs-seeder';
import { DataSource } from 'typeorm';

@Injectable()
export class UserRoleSeeder implements Seeder {
  constructor(private connection: DataSource) {}

  private dataRef: number[] = [];

  async seed(): Promise<any> {
    const dataConfig = [
      { id: 1, user_id: 1, role_id: 1 }, // admin01 = Super Admin
      { id: 2, user_id: 2, role_id: 2 }, // manager01 = Dept Manager
      { id: 3, user_id: 2, role_id: 3 }, // manager01 = Data Analyst (multi-role)
      { id: 4, user_id: 3, role_id: 3 }, // analyst01 = Data Analyst
      { id: 5, user_id: 4, role_id: 4 }, // viewer01 = Viewer
    ];

    for (const item of dataConfig) {
      this.dataRef.push(item.id);
    }

    const tableName = this.connection.getMetadata(UserRole).tableName;
    const existing = await this.connection.query<{ id: number }[]>(
      `SELECT * FROM ${tableName} WHERE "id" = ANY($1)`,
      [this.dataRef],
    );

    const arrDataInit = [];
    for (const item of dataConfig) {
      if (!existing.find((r: { id: number }) => r.id == item.id)) arrDataInit.push(item);
    }

    if (arrDataInit.length) {
      await this.connection.createQueryBuilder().insert().into(UserRole).values(arrDataInit).execute();
      await this.connection.query(
        `SELECT setval('user_roles_id_seq', (SELECT COALESCE(MAX(id), 1) FROM ${tableName}))`,
      );
    }
  }

  async drop(): Promise<any> {
    if (!this.dataRef.length) return;
    await this.connection
      .createQueryBuilder()
      .delete()
      .from(UserRole)
      .where('"id" IN (:...ids)', { ids: this.dataRef })
      .execute();
  }
}
