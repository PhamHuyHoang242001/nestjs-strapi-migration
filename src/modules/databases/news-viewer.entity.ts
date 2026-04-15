import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { News } from './news.entity';

// Tracks which users have viewed a news article
@Entity('news_viewers')
export class NewsViewer extends BaseSoftDeleteEntity {
  // user_id: plain FK column; no relation decorator
  @Column({ nullable: true, type: 'int' })
  public user_id: number;

  // FK to news
  @Column({ nullable: true, type: 'int' })
  public news_id: number;

  @ManyToOne(() => News, (news) => news.news_viewers)
  @JoinColumn({ name: 'news_id' })
  public news: News;
}
