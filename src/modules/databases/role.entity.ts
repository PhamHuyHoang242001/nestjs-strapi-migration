import { STATUS } from '@common/enums';
import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import {
  Column,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  Unique,
} from 'typeorm';
import { RoleDataAccess } from './data-access.entity';
import { UserRole } from './user-role.entity';
import { User } from './user.entity';
import { Permission } from './permission.entity';

export const ROLE_PERMISSION = 'role_permissions';

@Entity('roles')
export class Role extends BaseSoftDeleteEntity {
  @Column()
  name: string;

  @OneToMany(() => RolePermission, (rp) => rp.role, {
    cascade: true,
  })
  role_permissions: RolePermission[];

  @Column({ default: STATUS.ACTIVE })
  status: STATUS;

  @OneToMany(() => RoleDataAccess, (rda) => rda.role)
  role_data_access: RoleDataAccess[];

  @OneToMany(() => UserRole, (ur) => ur.role)
  user_roles: UserRole[];

  @Column({ nullable: true })
  created_by_id?: number;

  @ManyToOne(() => User, (u) => u.created_roles)
  @JoinColumn({ name: 'created_by_id' })
  created_by?: User;

  @Column({ nullable: true })
  updated_by_id?: number;

  @ManyToOne(() => User, (u) => u.updated_roles)
  @JoinColumn({ name: 'updated_by_id' })
  updated_by?: User;
}

@Entity('role_permissions')
@Unique(['role_id', 'permission_id'])
export class RolePermission extends BaseSoftDeleteEntity {
  @Column()
  role_id: number;

  @Column()
  permission_id: number;

  @ManyToOne(() => Role, (role) => role.role_permissions)
  @JoinColumn({ name: 'role_id' })
  role: Role;

  @ManyToOne(() => Permission, (permission) => permission.role_permissions)
  @JoinColumn({ name: 'permission_id' })
  permission: Permission;
}
