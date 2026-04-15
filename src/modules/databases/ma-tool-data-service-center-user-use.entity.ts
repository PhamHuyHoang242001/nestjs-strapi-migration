import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { MaToolDataServiceCenter } from './ma-tool-data-service-center.entity';

// Record of a user's usage session for a data service center
@Entity('ma_tool_data_service_center_user_uses')
export class MaToolDataServiceCenterUserUse extends BaseSoftDeleteEntity {
  @Column({ nullable: true, type: 'date' })
  public usage_date: Date;

  @Column({ nullable: true, type: 'int' })
  public usage_count: number;

  // user_id: plain nullable int, no decorator
  @Column({ nullable: true, type: 'int' })
  public user_id: number;

  // FK to ma_tool_data_service_centers
  @Column({ nullable: false, type: 'int' })
  public center_id: number;

  @ManyToOne(() => MaToolDataServiceCenter, (c) => c.user_uses)
  @JoinColumn({ name: 'center_id' })
  public center: MaToolDataServiceCenter;
}
