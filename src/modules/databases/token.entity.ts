import { STATUS, TOKEN_TYPE } from '@common/enums';
import { BaseColumn } from '@configuration/base-entity';
import { Users } from '@modules/databases/user.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { Admins } from './admin.entity';

@Entity()
export class Token extends BaseColumn {
  @Column({ nullable: true })
  public user_id: number;
  @ManyToOne(() => Users, (u) => u.id, { nullable: true })
  @JoinColumn({ name: 'user_id' })
  public user: Users;

  @Column({ nullable: true })
  public admin_id: number;
  @ManyToOne(() => Admins, (u) => u.id, { nullable: true })
  @JoinColumn({ name: 'admin_id' })
  public admin: Admins;

  @Column({ nullable: false })
  public client: string;

  @Column({ nullable: true })
  public access_token: string;

  @Column({ nullable: true })
  public refresh_token: string;

  @Column({ default: TOKEN_TYPE.LOGIN })
  public type: TOKEN_TYPE;

  @Column({ nullable: true })
  public expired_at: Date;

  @Column({ default: STATUS.ACTIVE })
  public status: STATUS;

  @Column({ nullable: true })
  public device_id: string;
}
