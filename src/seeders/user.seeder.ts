import { hashPassword } from '@common/utils';
import { Users } from '@modules/databases/user.entity';
import { Injectable } from '@nestjs/common';
import { Seeder } from 'nestjs-seeder';
import { DataSource } from 'typeorm';

@Injectable()
export class UserSeeder implements Seeder {
  constructor(private connection: DataSource) {}

  private dataRef: number[] = [];

  async seed(): Promise<any> {
    const dataConfig = [
      {
        id: 1,
        username: 'admin01',
        full_name: 'Nguyễn Văn Admin',
        email: 'admin01@vpbank.com.vn',
        team: 'Core Team',
        department: 'IT',
        branch_code: 'HN-HOI',
        region: 'MIEN_BAC',
        is_active: true,
        password: hashPassword('123456789a@A'),
        client: 'admin',
        status: 'active',
      },
      {
        id: 2,
        username: 'manager01',
        full_name: 'Trần Thị Manager',
        email: 'manager01@vpbank.com.vn',
        team: 'BI Team',
        department: 'Tài chính',
        branch_code: 'HCM-001',
        region: 'MIEN_NAM',
        is_active: true,
        password: hashPassword('123456789a@A'),
        status: 'active',
      },
      {
        id: 3,
        username: 'analyst01',
        full_name: 'Lê Văn Analyst',
        email: 'analyst01@vpbank.com.vn',
        team: 'Data Team',
        department: 'Bán lẻ',
        branch_code: 'DN-001',
        region: 'MIEN_TRUNG',
        is_active: true,
        password: hashPassword('123456789a@A'),
        status: 'active',
      },
      {
        id: 4,
        username: 'viewer01',
        full_name: 'Phạm Thị Viewer',
        email: 'viewer01@vpbank.com.vn',
        team: 'Report Team',
        department: 'Vận hành',
        branch_code: 'HP-001',
        region: 'MIEN_BAC',
        is_active: true,
        password: hashPassword('123456789a@A'),
        status: 'active',
      },
      {
        id: 5,
        username: 'inactive01',
        full_name: 'Hoàng Văn Inactive',
        email: 'inactive@vpbank.com.vn',
        team: 'Former Team',
        department: 'Nhân sự',
        branch_code: 'HN-CG',
        region: 'MIEN_BAC',
        is_active: false,
        password: hashPassword('123456789a@A'),
        status: 'inactive',
      },
    ];

    for (const item of dataConfig) {
      this.dataRef.push(item.id);
    }

    const tableName = this.connection.getMetadata(Users).tableName;
    const existing = await this.connection.query<{ id: number }[]>(
      `SELECT * FROM ${tableName} WHERE "id" = ANY($1)`,
      [this.dataRef],
    );

    const arrDataInit = [];
    for (const item of dataConfig) {
      if (!existing.find((u: { id: number }) => u.id == item.id)) arrDataInit.push(item);
    }

    if (arrDataInit.length) {
      for (const item of arrDataInit) {
        await this.connection.query(
          `INSERT INTO ${tableName} (id, username, full_name, email, team, department, branch_code, region, is_active, password, status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())`,
          [item.id, item.username, item.full_name, item.email, item.team, item.department, item.branch_code, item.region, item.is_active, item.password, item.status],
        );
      }
      await this.connection.query(
        `SELECT setval('users_id_seq', (SELECT COALESCE(MAX(id), 1) FROM ${tableName}))`,
      );
    }
  }

  async drop(): Promise<any> {
    if (!this.dataRef.length) return;
    await this.connection
      .createQueryBuilder()
      .delete()
      .from(Users)
      .where('"id" IN (:...ids)', { ids: this.dataRef })
      .execute();
  }
}
