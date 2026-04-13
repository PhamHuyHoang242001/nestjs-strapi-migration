import { Column, CreateDateColumn, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export const TIMESTAMP_TYPE = 'timestamp without time zone';

export abstract class BaseUuidColumn {
  @PrimaryGeneratedColumn('uuid')
  public id: string;

  @Column({ default: false })
  is_delete: boolean;

  @Column({ type: TIMESTAMP_TYPE, default: () => 'CURRENT_TIMESTAMP' })
  @CreateDateColumn({ type: TIMESTAMP_TYPE })
  public created_at: Date;

  @Column({ type: TIMESTAMP_TYPE, default: () => 'CURRENT_TIMESTAMP' })
  @UpdateDateColumn({ type: TIMESTAMP_TYPE })
  public updated_at: Date;
}
