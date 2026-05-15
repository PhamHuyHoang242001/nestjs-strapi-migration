import { DataSource } from 'typeorm';
import { getOrmConfig } from '../datasource';
import { DB_HOST, DB_NAME, DB_PASSWORD, DB_PORT, DB_USERNAME } from '@configuration/env.config';
import {
  BiDiagnosticLogActionEnum,
  BiDiagnosticLogClientTypeEnum,
  BiDiagnosticLogStatusEnum,
  BiDiagnosticLogTableEnum,
} from '@modules/databases/bi-diagnostic-log.entity';
import { IsEnum, IsNotEmpty, IsOptional } from 'class-validator';

interface ExtractedBiDiagnosticLog {
  id: number;
  ip_address: string;
  uri: string;
  client_email: string;
  action: string;
  old_data: unknown;
  new_data: unknown;
  log_status: string;
  table: string;
  client_type: string;
  error_message: string;
  deleted_at: string;
  created_at: string;
  updated_at: string;
}

export class BiDiagnosticLogDto {
  @IsNotEmpty()
  id: number;

  @IsOptional()
  ip_address: string;

  @IsOptional()
  uri: string;

  @IsOptional()
  client_email: string;

  @IsOptional()
  @IsEnum(BiDiagnosticLogActionEnum)
  action: BiDiagnosticLogActionEnum;

  @IsOptional()
  old_data: unknown;

  @IsOptional()
  new_data: unknown;

  @IsOptional()
  @IsEnum(BiDiagnosticLogStatusEnum)
  log_status: BiDiagnosticLogStatusEnum;

  @IsOptional()
  @IsEnum(BiDiagnosticLogTableEnum)
  table: BiDiagnosticLogTableEnum;

  @IsOptional()
  @IsEnum(BiDiagnosticLogClientTypeEnum)
  client_type: BiDiagnosticLogClientTypeEnum;

  @IsOptional()
  error_message: string;

  deleted_at: string;
  created_at: string;
  updated_at: string;
}

export class BiDiagnosticLogDataMigration {
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

    console.log(`[BiDiagnosticLogDataMigration] Migrate ${count} records completed.`);
  }

  async extract(offset: number, limit: number): Promise<ExtractedBiDiagnosticLog[]> {
    const query = `
      SELECT
        id,
        ip_address,
        uri,
        client_email,
        action,
        old_data,
        new_data,
        log_status,
        "table",
        client_type,
        error_message,
        deleted_at,
        created_at,
        updated_at
      FROM bi_diagnostic_logs
      ORDER BY id ASC
      LIMIT $1 OFFSET $2
    `;

    return this.dataSource.query(query, [limit, (offset - 1) * limit]);
  }

  transform(data: ExtractedBiDiagnosticLog[]): { data: BiDiagnosticLogDto[]; columns: string[] } {
    const transforms = data.map((item) => {
      return {
        id: item.id,
        ip_address: item.ip_address,
        uri: item.uri,
        client_email: item.client_email,
        action: item.action ?? null,
        old_data: item.old_data ?? null,
        new_data: item.new_data ?? null,
        log_status: item.log_status ?? null,
        table: item.table ?? null,
        client_type: item.client_type ?? null,
        error_message: item.error_message,
        deleted_at: item.deleted_at,
        created_at: item.created_at,
        updated_at: item.updated_at,
      } as BiDiagnosticLogDto;
    });

    return {
      data: transforms,
      columns: [
        'id',
        'ip_address',
        'uri',
        'client_email',
        'action',
        'old_data',
        'new_data',
        'log_status',
        '"table"',
        'client_type',
        'error_message',
        'deleted_at',
        'created_at',
        'updated_at',
      ],
    };
  }

  async resetSequence() {
    await this.dataDestination.query(`
      SELECT setval(
        'bi_diagnostic_logs_id_seq',
        COALESCE((SELECT MAX(id) FROM bi_diagnostic_logs), 1)
      )
    `);
  }

  async load(data: BiDiagnosticLogDto[], columns: string[]) {
    const query = `
      INSERT INTO bi_diagnostic_logs (${columns.join(',')})
      SELECT
        id, ip_address, uri, client_email, action, old_data,
        new_data, log_status, "table", client_type, error_message,
        deleted_at, created_at, updated_at
      FROM json_to_recordset($1::json)
      AS x(
        id INT,
        ip_address TEXT,
        uri TEXT,
        client_email TEXT,
        action TEXT,
        old_data JSON,
        new_data JSON,
        log_status TEXT,
        "table" TEXT,
        client_type TEXT,
        error_message TEXT,
        deleted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ
      )
      ON CONFLICT (id)
      DO UPDATE SET
        ip_address = EXCLUDED.ip_address,
        uri = EXCLUDED.uri,
        client_email = EXCLUDED.client_email,
        action = EXCLUDED.action,
        old_data = EXCLUDED.old_data,
        new_data = EXCLUDED.new_data,
        log_status = EXCLUDED.log_status,
        "table" = EXCLUDED."table",
        client_type = EXCLUDED.client_type,
        error_message = EXCLUDED.error_message,
        deleted_at = EXCLUDED.deleted_at,
        updated_at = EXCLUDED.updated_at
    `;
    if (!data.length) return;
    await this.dataDestination.query(query, [JSON.stringify(data)]);
  }
}
