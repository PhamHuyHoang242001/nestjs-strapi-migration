import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity } from 'typeorm';

// Audit log recording search queries performed by a user
@Entity('search_logs')
export class SearchLog extends BaseSoftDeleteEntity {
  @Column({ nullable: true })
  public query: string;

  @Column({ nullable: true })
  public is_published: boolean;

  // plain FK; no User relation decorator
  @Column({ nullable: true, type: 'int' })
  public user_id: number;
}
