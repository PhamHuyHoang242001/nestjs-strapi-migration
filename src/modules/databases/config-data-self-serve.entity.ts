import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('config_data_self_serve')
export class ConfigDataSelfServe {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', nullable: false, unique: true })
  key: string;

  @Column({ type: 'jsonb', nullable: false })
  value: { user_daily_limit?: number; [key: string]: unknown };

  @Column({ type: 'int', nullable: true })
  created_by_user_id: number;

  @Column({ type: 'int', nullable: true })
  updated_by_user_id: number;
}
