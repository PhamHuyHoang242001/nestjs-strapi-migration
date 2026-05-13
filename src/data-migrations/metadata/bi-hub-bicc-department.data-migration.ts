import { DataSource } from 'typeorm';
import { getOrmConfig } from '../datasource';
import { DB_HOST, DB_NAME, DB_PASSWORD, DB_PORT, DB_USERNAME } from '@configuration/env.config';
import { IsEnum, IsNotEmpty, IsOptional } from 'class-validator';
import { BiccDepartmentStatusEnum } from '@modules/databases/bi-hub-bicc-department.entity';

interface ExtractedBiccDepartment {
  id: number;
  name: string;
  code: string;
  image: string;
  bicc_department_status: string;
  created_at: string;
  updated_at: string;
}

export class BiHubBiccDepartmentDto {
  @IsNotEmpty()
  id: number;

  @IsNotEmpty()
  name: string;

  @IsNotEmpty()
  code: string;

  @IsOptional()
  image: string;

  @IsOptional()
  @IsEnum(BiccDepartmentStatusEnum)
  status: BiccDepartmentStatusEnum;

  created_at: string;
  updated_at: string;
}

export class BiHubBiccDepartmentDataMigration {
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
      const { data, columns } = this.transform(raws);
      await this.load(data, columns);

      if (raws.length < limit) {
        isFetch = false;
      }

      count += raws.length;
      offset += 1;
    }

    await this.resetSequence();

    console.log(`[BiccDepartmentDataMigration] Migrate ${count} records completed.`);
  }

  async extract(offset: number, limit: number): Promise<ExtractedBiccDepartment[]> {
    const query = `
      SELECT
        bicc.id,
        bicc.name,
        bicc.code,
        f_image.url as image,
        bicc.bicc_department_status,
        bicc.created_at,
        bicc.updated_at
      FROM bi_hub_bicc_departments bicc
      INNER JOIN files_related_mph fr_image
        ON fr_image.related_id = bicc.id
        AND fr_image.related_type = 'api::bi-hub-report.bi-hub-bicc-department'
        AND fr_image.field = 'image'
      INNER JOIN files f_image ON f_image.id = fr_image.file_id
      WHERE f_image.url IS NOT NULL OR f_image.url != ''
      ORDER BY id ASC
      LIMIT $1 OFFSET $2
    `;

    return this.dataSource.query(query, [limit, (offset - 1) * limit]);
  }

  transform(data: ExtractedBiccDepartment[]): { data: BiHubBiccDepartmentDto[]; columns: string[] } {
    const transforms = data.map((item) => {
      return {
        id: item.id,
        name: item.name,
        code: item.code,
        image: item.image,
        status: item.bicc_department_status ?? null,
        created_at: item.created_at,
        updated_at: item.updated_at,
      } as BiHubBiccDepartmentDto;
    });

    return {
      data: transforms,
      columns: ['id', 'name', 'code', 'image', 'status', 'created_at', 'updated_at'],
    };
  }

  async resetSequence() {
    await this.dataDestination.query(`
      SELECT setval(
        'bi_hub_bicc_departments_id_seq',
        COALESCE((SELECT MAX(id) FROM bi_hub_bicc_departments), 1)
      )
    `);
  }

  async load(data: BiHubBiccDepartmentDto[], columns: string[]) {
    const query = `
      INSERT INTO bi_hub_bicc_departments (${columns.join(',')})
      SELECT
        id, name, code, image, status, created_at, updated_at
      FROM json_to_recordset($1::json)
      AS x(
        id INT,
        name TEXT,
        code TEXT,
        image TEXT,
        status TEXT,
        created_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ
      )
      ON CONFLICT (id)
      DO UPDATE SET
        name = EXCLUDED.name,
        code = EXCLUDED.code,
        image = EXCLUDED.image,
        status = EXCLUDED.status,
        updated_at = EXCLUDED.updated_at
    `;
    if (!data.length) return;
    await this.dataDestination.query(query, [JSON.stringify(data)]);
  }
}
