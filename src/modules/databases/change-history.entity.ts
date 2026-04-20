import { CHANGE_ACTION_TYPE, CHANGE_ENTITY_TYPE } from '@common/enums';
import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Role } from '@modules/databases/role.entity';
import { Users } from '@modules/databases/user.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

@Entity('change_history')
export class ChangeHistory extends BaseSoftDeleteEntity {
  @Column({ enum: CHANGE_ENTITY_TYPE })
  public entity_type: CHANGE_ENTITY_TYPE;

  @Column({ enum: CHANGE_ACTION_TYPE })
  public action_type: CHANGE_ACTION_TYPE;

  @Column({ nullable: true })
  public entity_id: string;

  @Column({ nullable: true })
  public entity_name: string;

  @Column({ nullable: true })
  public role_id?: number;
  @ManyToOne('Role', 'change_histories')
  @JoinColumn({ name: 'role_id' })
  public role_ref?: Role;

  @Column({ nullable: true })
  public user_id?: number;
  @ManyToOne('Users', 'change_histories')
  @JoinColumn({ name: 'user_id' })
  public user_ref?: Users;

  @Column()
  public performed_by: string;

  @Column({ nullable: true, type: 'text' })
  public old_value: string;

  @Column({ nullable: true, type: 'text' })
  public new_value: string;

  @Column()
  public description: string;
}
