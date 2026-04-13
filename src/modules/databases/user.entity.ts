import { GENDER, USER_STATUS } from '@common/enums';
import { Role } from '@modules/databases/role.entity';
import { BaseSoftDeleteEntity } from '../../configuration/base-entity';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';

@Entity('users')
export class Users extends BaseSoftDeleteEntity {
  @Column({ nullable: true })
  public phone: string;

  @Column({ nullable: true })
  public phone_code: string;

  @Column({ nullable: true })
  public last_name: string;

  @Column({ nullable: true })
  public first_name: string;

  @Column({ nullable: true, unique: true })
  public guest_id: string;

  @Column({ nullable: true })
  public country: string;

  @Column({ nullable: true })
  public country_iso: string;

  @Column({ nullable: true })
  public phone_iso: string;

  @Column({ nullable: true })
  public address_line: string;

  @Column({ default: true })
  public is_registered: boolean;

  @Column({ nullable: true })
  public state: string;

  @Column({ nullable: true })
  public state_iso: string;

  @Column({ nullable: true, enum: GENDER })
  public gender: GENDER;

  @Column({ nullable: true })
  public date_of_birth: string;

  @Column({ nullable: true })
  public password: string;

  @Column({ nullable: true })
  public email: string;

  @Column({ nullable: true })
  public sso_id: string;

  @Column({ nullable: true })
  public verify_code: string;

  @Column({ nullable: true, type: 'bigint' })
  public verify_code_expired: number;

  @Column({ enum: USER_STATUS, default: USER_STATUS.INACTIVE })
  public status: USER_STATUS;

  @Column({ nullable: true })
  public delete_reason: string;

  @Column({ nullable: true })
  role_id?: number;
  @ManyToOne(() => Role, (u) => u.id)
  @JoinColumn({ name: 'role_id' })
  role?: Role;
}
