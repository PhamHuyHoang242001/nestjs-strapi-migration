import { SCOPE_TYPE } from '@common/enums';
import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Module } from '@modules/databases/module.entity';
import { Permission } from '@modules/databases/permission.entity';
import { Role } from '@modules/databases/role.entity';
import { Users } from '@modules/databases/user.entity';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';

@Entity('data_access')
export class DataAccess extends BaseSoftDeleteEntity {
  @Column()
  public data_id: number;

  @Column()
  public module_id: number;

  @ManyToOne('Module', 'data_access_rules')
  @JoinColumn({ name: 'module_id' })
  public module?: Module;

  @Column({ enum: SCOPE_TYPE })
  public scope_type: SCOPE_TYPE;

  @Column({ nullable: true, type: 'timestamp without time zone' })
  public start_date: Date;

  @Column({ nullable: true, type: 'timestamp without time zone' })
  public end_date: Date;

  @OneToMany(() => UserDataAccess, (uda) => uda.data_access)
  user_data_access: UserDataAccess[];

  @OneToMany(() => RoleDataAccess, (rda) => rda.data_access)
  role_data_access: RoleDataAccess[];

  @OneToMany(() => PermissionDataAccess, (pda) => pda.data_access)
  permission_data_access: PermissionDataAccess[];
}

@Entity('data_access_users')
export class UserDataAccess extends BaseSoftDeleteEntity {
  @Column()
  user_id: number;

  @Column()
  data_access_id: number;

  @ManyToOne(() => Users, (u) => u.user_data_access)
  @JoinColumn({ name: 'user_id' })
  user: Users;

  @ManyToOne(() => DataAccess, (da) => da.user_data_access)
  @JoinColumn({ name: 'data_access_id' })
  data_access: DataAccess;
}

@Entity('data_access_roles')
export class RoleDataAccess extends BaseSoftDeleteEntity {
  @Column()
  role_id: number;

  @Column()
  data_access_id: number;

  @ManyToOne(() => Role, (r) => r.role_data_access)
  @JoinColumn({ name: 'role_id' })
  role: Role;

  @ManyToOne(() => DataAccess, (da) => da.role_data_access)
  @JoinColumn({ name: 'data_access_id' })
  data_access: DataAccess;
}

@Entity('data_permissions')
export class PermissionDataAccess extends BaseSoftDeleteEntity {
  @Column()
  permission_id: number;

  @Column()
  data_access_id: number;

  @ManyToOne(() => Permission, (p) => p.permission_data_access)
  @JoinColumn({ name: 'permission_id' })
  permission: Permission;

  @ManyToOne(() => DataAccess, (da) => da.permission_data_access)
  @JoinColumn({ name: 'data_access_id' })
  data_access: DataAccess;
}
