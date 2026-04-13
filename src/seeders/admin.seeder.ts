import { USER_STATUS } from '@common/enums';
import { hashPassword } from '@common/utils';
import { Admins } from '@modules/databases/admin.entity';
import { Injectable } from '@nestjs/common';
import { Seeder } from 'nestjs-seeder';
import { DataSource } from 'typeorm';

@Injectable()
export class AdminSeeder implements Seeder {
  constructor(private connection: DataSource) { }

  private dataRef: number[] = [];
  async seed(): Promise<any> {
    console.log('table', this.connection.getMetadata(Admins).tableName);
    const arrDataInit = [];

    const dataConfig = [
      {
        id: 1,
        email: 'congvudev@gmail.com',
        password: hashPassword('123456789a@A'),
        client: 'admin',
        status: USER_STATUS.ACTIVE,
      },
    ];
    for (const item of dataConfig) {
      this.dataRef.push(item.id);
    }

    const pipeline = `SELECT * FROM ${this.connection.getMetadata(Admins).tableName} WHERE "id" = ANY($1) ;`;
    const rs = await this.connection.query(pipeline, [this.dataRef]);
    for (const item of dataConfig) {
      if (!rs.find((u) => u.id == item.id)) arrDataInit.push(item);
    }

    if (!arrDataInit.length) return !0;
    await this.connection.createQueryBuilder().insert().into(Admins).values(arrDataInit).execute();
  }

  async drop(): Promise<any> {
    await this.connection
      .createQueryBuilder()
      .delete()
      .from(Admins)
      .where('"id" IN (:...ids)', { ids: this.dataRef })
      .execute();
  }
}
