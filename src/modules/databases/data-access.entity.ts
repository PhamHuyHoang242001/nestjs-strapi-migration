import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { RoleDataAccess } from '@modules/databases/role-data-access.entity';
import { UserPermissionData } from '@modules/databases/user-permission-data.entity';
import { Column, Entity, OneToMany } from 'typeorm';

@Entity('data_access')
export class DataAccess extends BaseSoftDeleteEntity {
  @Column()
  public data_id: number;

  @Column({ nullable: true })
  public table_name: string;

  // Inverse relations
  @OneToMany('RoleDataAccess', 'data_access')
  role_data_access?: RoleDataAccess[];

  @OneToMany('UserPermissionData', 'data_access')
  user_permission_data?: UserPermissionData[];
}
