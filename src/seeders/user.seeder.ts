import { hashPassword } from '@common/utils';
import { Users } from '@modules/databases/user.entity';
import { Injectable } from '@nestjs/common';
import { Seeder } from 'nestjs-seeder';
import { DataSource } from 'typeorm';

@Injectable()
export class UserSeeder implements Seeder {
  constructor(private connection: DataSource) { }

  private dataRef: number[] = [];
  async seed(): Promise<any> {
    console.log('table', this.connection.getMetadata(Users).tableName);
    const arrDataInit = [];

    const dataConfig = [
      {
        id: 1,
        email: 'congvudev@gmail.com',
        password: hashPassword('123456789a@A'),
        client: 'admin',
      },
    ];
    for (const item of dataConfig) {
      this.dataRef.push(item.id);
    }

    const pipeline = `SELECT * FROM ${this.connection.getMetadata(Users).tableName} WHERE "id" = ANY($1) ;`;
    const rs = await this.connection.query(pipeline, [this.dataRef]);

    for (const item of dataConfig) {
      if (!rs.find((u) => u.id == item.id)) arrDataInit.push(item);
    }

    if (!arrDataInit.length) return !0;
    await this.connection.createQueryBuilder().insert().into(Users).values(arrDataInit).execute();
  }

  async drop(): Promise<any> {
    await this.connection
      .createQueryBuilder()
      .delete()
      .from(Users)
      .where('"id" IN (:...ids)', { ids: this.dataRef })
      .execute();
  }
}
