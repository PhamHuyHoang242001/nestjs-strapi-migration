import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { Users } from './user.entity';
import { BaseSoftDeleteEntity } from '@configuration/base-entity';
@Entity('user_address')
export class UserAddress extends BaseSoftDeleteEntity {
  @Column({ nullable: true })
  public user_id?: number;
  @ManyToOne(() => Users, (u) => u.id)
  @JoinColumn({ name: 'user_id' })
  public user?: Users;

  @Column({ nullable: true })
  public address_line_2: string;

  @Column({ nullable: true })
  public province: string;

  @Column({ nullable: true, default: false })
  public is_save: boolean;
}
