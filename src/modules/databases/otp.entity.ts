import { OTP_STATUS } from '@common/enums';
import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { TEMPLATE_ID } from '@constant/template';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { Users } from './user.entity';
import { Admins } from './admin.entity';

@Entity()
export class Otp extends BaseSoftDeleteEntity {
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
  public code: string;

  @Column({ nullable: false })
  public client: string;

  @Column({ nullable: false, enum: TEMPLATE_ID })
  public template_id: TEMPLATE_ID;

  @Column({ enum: OTP_STATUS, default: OTP_STATUS.PENDING })
  public status: OTP_STATUS;

  @Column({ nullable: false, type: 'bigint' })
  public expire_time: number;
}
