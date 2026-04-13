import { GENDER, USER_STATUS } from '@common/enums';
import { Role } from '@modules/databases/role.entity';
import { BaseSoftDeleteEntity } from '../../configuration/base-entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

@Entity('admins')
export class Admins extends BaseSoftDeleteEntity {

  @Column({ nullable: true })
  public last_name: string;

  @Column({ nullable: true })
  public first_name: string;

  @Column({ nullable: true })
  public country: string;

  @Column({ nullable: true, enum: GENDER })
  public gender: GENDER;

  @Column({ nullable: true })
  public password: string;

  @Column({ nullable: true })
  public email: string;

  @Column({ nullable: true })
  public verify_code: string;

  @Column({ nullable: true, type: 'bigint' })
  public verify_code_expried: number;

  @Column({ enum: USER_STATUS, default: USER_STATUS.INACTIVE })
  public status: USER_STATUS;

  @Column({ nullable: true })
  role_id?: number;
  @ManyToOne(() => Role, (u) => u.id)
  @JoinColumn({ name: 'role_id' })
  role?: Role;
}
