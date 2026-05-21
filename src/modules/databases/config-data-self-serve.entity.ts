import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('config_data_self_serve')
export class ConfigDataSelfServe {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', nullable: false })
  key: string;

  @Column({ type: 'jsonb', nullable: false })
  value: { user_daily_limit?: number; [key: string]: unknown };
}
