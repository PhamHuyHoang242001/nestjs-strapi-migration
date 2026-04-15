import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { NewsType } from '@common/enums/ux-common.enums';
import { Column, Entity, OneToMany } from 'typeorm';
import { NewsViewer } from './news-viewer.entity';

// News article published to users
@Entity('news')
export class News extends BaseSoftDeleteEntity {
  @Column({ nullable: true })
  public title: string;

  @Column({ nullable: true, type: 'text' })
  public description: string;

  @Column({ nullable: true, type: 'text' })
  public content: string;

  // News article type: FEATURE | MAINTENANCE | INSTRUCT
  @Column({ nullable: true, type: 'varchar' })
  public type: NewsType;

  @Column({ nullable: true, type: 'jsonb' })
  public files: object;

  @Column({ nullable: true, default: false })
  public is_deleted: boolean;

  @OneToMany(() => NewsViewer, (viewer) => viewer.news)
  public news_viewers: NewsViewer[];
}
