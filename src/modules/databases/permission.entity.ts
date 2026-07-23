import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { Module } from './module.entity';
import { UserDataAccess } from './data-access.entity';
import { RolePermission } from './role.entity';

@Entity('permissions')
export class Permission extends BaseSoftDeleteEntity {
  @Column()
  name: string;

  @Column()
  code: string;

  @Column()
  method: string;

  @Column()
  action: string;

  @Column({ default: true })
  is_active: boolean;

  @OneToMany(() => RolePermission, (rp) => rp.permission)
  role_permissions: RolePermission[];

  @Column()
  module_id: number;

  @ManyToOne(() => Module, (data) => data.permissions)
  @JoinColumn({ name: 'module_id' })
  module: Module;

  @OneToMany(() => UserDataAccess, (uda) => uda.permission)
  user_data_access: UserDataAccess[];
}
