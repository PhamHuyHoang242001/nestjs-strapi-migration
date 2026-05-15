import { Entity, Column } from 'typeorm';
import { BaseSoftDeleteEntity } from '@configuration/base-entity';

export enum BiDiagnosticLogActionEnum {
  READ = 'read',
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  DOWNLOAD = 'download',
}

export enum BiDiagnosticLogStatusEnum {
  SUCCESS = 'success',
  ERROR = 'error',
}

export enum BiDiagnosticLogTableEnum {
  REPORT = 'report',
  BICC_DEPARTMENT = 'bicc-department',
  CENTER = 'center',
  DIVISION = 'division',
  DEPARTMENT = 'department',
  LABEL = 'label',
}

export enum BiDiagnosticLogClientTypeEnum {
  ADMIN = 'admin',
  USER = 'user',
}

@Entity('bi_diagnostic_logs')
export class BiDiagnosticLog extends BaseSoftDeleteEntity {
  @Column({ type: 'varchar', nullable: true })
  ip_address: string;

  @Column({ type: 'varchar', nullable: true })
  uri: string;

  @Column({ type: 'varchar', nullable: true })
  client_email: string;

  @Column({ nullable: true })
  action: BiDiagnosticLogActionEnum;

  @Column({ type: 'json', nullable: true })
  old_data: any;

  @Column({ type: 'json', nullable: true })
  new_data: any;

  @Column({ nullable: true })
  log_status: BiDiagnosticLogStatusEnum;

  @Column({ nullable: true })
  table: BiDiagnosticLogTableEnum;

  @Column({ nullable: true })
  client_type: BiDiagnosticLogClientTypeEnum;

  @Column({ type: 'text', nullable: true })
  error_message: string;
}
