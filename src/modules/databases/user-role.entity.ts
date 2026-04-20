import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Role } from '@modules/databases/role.entity';
import { Users } from '@modules/databases/user.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

@Entity('user_roles')
export class UserRole extends BaseSoftDeleteEntity {
  @Column()
  public user_id: number;
  @ManyToOne('Users', 'user_roles')
  @JoinColumn({ name: 'user_id' })
  public user?: Users;

  @Column()
  public role_id: number;
  @ManyToOne('Role', 'user_roles')
  @JoinColumn({ name: 'role_id' })
  public role?: Role;
}
