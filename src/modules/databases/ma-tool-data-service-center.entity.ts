import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, OneToMany } from 'typeorm';
import { MaToolDataServiceCenterUserUse } from './ma-tool-data-service-center-user-use.entity';
import { MaToolDataServiceCenterBookmark } from './ma-tool-data-service-center-bookmark.entity';

// Data service center representing a shared data product or service
@Entity('ma_tool_data_service_centers')
export class MaToolDataServiceCenter extends BaseSoftDeleteEntity {
  @Column({ nullable: true })
  public name: string;

  @Column({ nullable: true, type: 'text' })
  public description: string;

  @Column({ nullable: true })
  public center_status: string;

  // Reverse: usage records for this center
  @OneToMany(() => MaToolDataServiceCenterUserUse, (u) => u.center)
  public user_uses: MaToolDataServiceCenterUserUse[];

  // Reverse: bookmarks for this center
  @OneToMany(() => MaToolDataServiceCenterBookmark, (b) => b.center)
  public bookmarks: MaToolDataServiceCenterBookmark[];
}
