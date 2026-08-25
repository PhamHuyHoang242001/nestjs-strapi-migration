import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { ApiPackage } from './api-catalog-package.entity';

export enum ApiVersionState {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export enum ApiHttpMethod {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  DELETE = 'DELETE',
}

export enum ApiInputFormat {
  BODY = 'body',
  QUERY = 'query',
  UPLOAD_FILE = 'upload_file',
}

export enum ApiCallMode {
  SYNC = 'sync',
  ASYNC = 'async',
}

@Entity('api_catalog_versions')
export class ApiVersion extends BaseSoftDeleteEntity {
  @Column({ type: 'int' })
  public api_catalog_package_id: number;

  @ManyToOne(() => ApiPackage, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'api_catalog_package_id' })
  public api_catalog_package: ApiPackage;

  @Column({ type: 'int' })
  public version_no: number;

  @Column({ type: 'int', nullable: true })
  public old_version: number | null;

  @Column({ type: 'varchar', default: ApiVersionState.PENDING })
  public state: ApiVersionState;

  @Column({ type: 'varchar' })
  public name: string;

  @Column({ type: 'text' })
  public short_description: string;

  @Column({ type: 'int', nullable: true })
  public category_id: number | null;

  @Column({ type: 'text', default: '' })
  public usage_guide_html: string;

  @Column({ type: 'varchar', nullable: true })
  public avatar_url: string | null;

  @Column({ type: 'varchar' })
  public http_method: ApiHttpMethod;

  @Column({ type: 'varchar' })
  public endpoint_path: string;

  @Column({ type: 'varchar', default: ApiInputFormat.BODY })
  public input_format: ApiInputFormat;

  @Column({ type: 'varchar', default: ApiCallMode.SYNC })
  public call_mode: ApiCallMode;

  @Column({ type: 'varchar', nullable: true })
  public sync_timeout: string | null;

  @Column({ type: 'varchar', nullable: true })
  public sla: string | null;

  @Column({ type: 'varchar', nullable: true })
  public tps: string | null;

  @Column({ type: 'varchar', nullable: true })
  public latency_p95: string | null;

  @Column({ type: 'varchar', nullable: true })
  public throughput: string | null;

  @Column({ type: 'varchar', nullable: true })
  public max_payload: string | null;

  @Column({ type: 'varchar', nullable: true })
  public rate_limit: string | null;

  @Column({ type: 'varchar', nullable: true })
  public encryption: string | null;

  @Column({
    type: 'jsonb',
    default: {},
    comment:
      'JSON duy nhất cho request input. Key sync/async. body/query = object; upload_file = { fields, files[] } (mỗi file.url bắt buộc).',
  })
  public mock_req: Record<string, unknown>;

  @Column({
    type: 'jsonb',
    default: {},
    comment: 'Sample response: cùng key mode với mock_req; mỗi value là object.',
  })
  public mock_res: Record<string, unknown>;

  @Column({ type: 'text', nullable: true })
  public changelog_note: string | null;

  @Column({ type: 'int' })
  public submitted_by: number;

  @Column({ type: 'int', nullable: true })
  public reviewed_by: number | null;

  @Column({ type: 'timestamp without time zone', nullable: true })
  public reviewed_at: Date | null;

  @Column({ type: 'text', nullable: true })
  public reject_reason: string | null;
}
