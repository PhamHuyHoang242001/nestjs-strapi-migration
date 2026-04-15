import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { MaToolDataServiceCenter } from './ma-tool-data-service-center.entity';

// User bookmark for an MA Tool data service center
@Entity('ma_tool_data_service_center_bookmarks')
export class MaToolDataServiceCenterBookmark extends BaseSoftDeleteEntity {
  @Column({ nullable: true })
  public is_bookmarked: boolean;

  // user_id: plain nullable int, no decorator
  @Column({ nullable: true, type: 'int' })
  public user_id: number;

  // FK to ma_tool_data_service_centers
  @Column({ nullable: false, type: 'int' })
  public center_id: number;

  @ManyToOne(() => MaToolDataServiceCenter, (c) => c.bookmarks)
  @JoinColumn({ name: 'center_id' })
  public center: MaToolDataServiceCenter;
}
