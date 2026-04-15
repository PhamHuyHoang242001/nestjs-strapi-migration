import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity } from 'typeorm';

// User feedback submission with optional rating
@Entity('feedback_users')
export class FeedbackUser extends BaseSoftDeleteEntity {
  @Column({ nullable: true, type: 'text' })
  public description: string;

  @Column({ nullable: true, type: 'int' })
  public rating: number;

  // user_id: plain FK column; no relation decorator
  @Column({ nullable: true, type: 'int' })
  public user_id: number;
}
