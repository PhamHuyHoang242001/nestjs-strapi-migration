import { SCOPE_TYPE } from '@common/enums';
import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Permission } from '@modules/databases/permission.entity';
import { Role } from '@modules/databases/role.entity';
import { Users } from '@modules/databases/user.entity';
import { Column, Entity, JoinTable, ManyToMany } from 'typeorm';

export const DATA_PERMISSIONS = 'data_permissions';
export const DATA_ACCESS_USERS = 'data_access_users';
export const DATA_ACCESS_ROLES = 'data_access_roles';

@Entity('data_access')
export class DataAccess extends BaseSoftDeleteEntity {
  @Column()
  public data_id: number;

  @Column()
  public table_name: string;

  @Column({ enum: SCOPE_TYPE })
  public scope_type: SCOPE_TYPE;

  @Column({ nullable: true, type: 'timestamp without time zone' })
  public start_date: Date;

  @Column({ nullable: true, type: 'timestamp without time zone' })
  public end_date: Date;

  @ManyToMany(() => Users, (user) => user.data_access_rules, { cascade: true })
  @JoinTable({
    name: DATA_ACCESS_USERS,
    joinColumn: { name: 'data_access_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'user_id', referencedColumnName: 'id' },
  })
  users: Users[];

  @ManyToMany(() => Role, (role) => role.data_access_rules, { cascade: true })
  @JoinTable({
    name: DATA_ACCESS_ROLES,
    joinColumn: { name: 'data_access_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'role_id', referencedColumnName: 'id' },
  })
  roles: Role[];

  @ManyToMany(() => Permission, { cascade: true })
  @JoinTable({
    name: DATA_PERMISSIONS,
    joinColumn: { name: 'data_access_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'permission_id', referencedColumnName: 'id' },
  })
  permissions: Permission[];
}
