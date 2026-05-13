import { DataSource } from 'typeorm';
import { getOrmConfig } from '../datasource';
import { DB_HOST, DB_NAME, DB_PASSWORD, DB_PORT, DB_USERNAME } from '@configuration/env.config';

interface ExtractedBiccRelation {
  bicc_department_id: number;
  s3_id: number | null;
  created_by_id: number | null;
  updated_by_id: number | null;
}

interface S3Relation {
  bicc_department_id: number;
  s3_id: number;
}

interface UserRelation {
  id: number;
  updated_by_id: number | null;
  created_by_id: number | null;
}

interface TransformedRelations {
  s3Relations: S3Relation[];
  userRelations: UserRelation[];
}

export class BiHubBiccDepartmentRelationDataMigration {
  private dataDestination: DataSource;
  private dataSource: DataSource;

  constructor(data: { db_host: string; db_port: string; db_username: string; db_name: string; db_password: string }) {
    this.dataDestination = new DataSource(
      getOrmConfig({
        host: DB_HOST,
        port: DB_PORT,
        username: DB_USERNAME,
        password: DB_PASSWORD,
        db_name: DB_NAME,
      }),
    );

    this.dataSource = new DataSource(
      getOrmConfig({
        host: data.db_host,
        port: +data.db_port,
        username: data.db_username,
        password: data.db_password,
        db_name: data.db_name,
      }),
    );
  }

  async run() {
    await this.dataDestination.initialize();
    await this.dataSource.initialize();

    const limit = 10000;
    let offset = 1;
    let isFetch = true;
    let count = 0;

    while (isFetch) {
      const raws = await this.extract(offset, limit);
      const transformed = this.transform(raws);
      await this.load(transformed);

      if (raws.length < limit) {
        isFetch = false;
      }

      count += raws.length;
      offset += 1;
    }

    console.log(`[BiHubBiccDepartmentRelation] Migrate ${count} records completed.`);
  }

  async extract(offset: number, limit: number): Promise<ExtractedBiccRelation[]> {
    const query = `
      SELECT
        b.id as bicc_department_id,
        bicc_s3_lnk.ma_tool_s_3_id as s3_id,
        created_user.id as created_by_id,
        updated_user.id as updated_by_id
      FROM bi_hub_bicc_departments b
      LEFT JOIN ma_tool_s_3_s_bicc_departments_lnk bicc_s3_lnk ON bicc_s3_lnk.bi_hub_bicc_department_id = b.id
      LEFT JOIN admin_users creater ON b.created_by_id = creater.id
      LEFT JOIN up_users created_user ON creater.email = created_user.email
      LEFT JOIN admin_users updater ON b.updated_by_id = updater.id
      LEFT JOIN up_users updated_user ON updater.email = updated_user.email
      WHERE b.created_by_id IS NOT NULL OR b.updated_by_id IS NOT NULL
      ORDER BY bicc_department_id ASC
      LIMIT $1 OFFSET $2
    `;

    return this.dataSource.query(query, [limit, (offset - 1) * limit]);
  }

  transform(data: ExtractedBiccRelation[]): TransformedRelations {
    const s3Relations: S3Relation[] = [];
    const userRelationsMap = new Map<number, UserRelation>();

    data.forEach((item) => {
      if (item.s3_id && item.bicc_department_id) {
        s3Relations.push({
          bicc_department_id: item.bicc_department_id,
          s3_id: item.s3_id,
        });
      }

      if (!userRelationsMap.has(item.bicc_department_id)) {
        userRelationsMap.set(item.bicc_department_id, {
          id: item.bicc_department_id,
          updated_by_id: item.updated_by_id ?? null,
          created_by_id: item.created_by_id ?? null,
        });
      }
    });

    return {
      s3Relations,
      userRelations: Array.from(userRelationsMap.values()),
    };
  }

  async load({ s3Relations, userRelations }: TransformedRelations) {
    if (s3Relations.length) {
      const queryS3 = `
        INSERT INTO bicc_departments_s3s (bicc_department_id, s3_id)
        SELECT x.bicc_department_id, x.s3_id
        FROM json_to_recordset($1::json) AS x(bicc_department_id INT, s3_id INT)
        INNER JOIN bi_hub_bicc_departments d ON d.id = x.bicc_department_id
        INNER JOIN s3s s ON s.id = x.s3_id
        ON CONFLICT DO NOTHING
      `;
      await this.dataDestination.query(queryS3, [JSON.stringify(s3Relations)]);
    }

    if (userRelations.length) {
      const queryUser = `
        UPDATE bi_hub_bicc_departments d
        SET
          updated_by_id = x.updated_by_id,
          created_by_id = x.created_by_id
        FROM json_to_recordset($1::json) AS x(id INT, updated_by_id INT, created_by_id INT)
        WHERE d.id = x.id
      `;
      await this.dataDestination.query(queryUser, [JSON.stringify(userRelations)]);
    }
  }
}
