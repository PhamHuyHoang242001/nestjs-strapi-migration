import { STATUS } from '@common/enums';
import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { DataAccess } from '@modules/databases/data-access.entity';
import { Permission } from '@modules/databases/permission.entity';
import { UserRole } from '@modules/databases/user-role.entity';
import { Users } from '@modules/databases/user.entity';
import { Column, Entity, JoinColumn, JoinTable, ManyToMany, ManyToOne, OneToMany } from 'typeorm';

export const ROLE_PERMISSION = 'roles_permissions';

@Entity()
export class Role extends BaseSoftDeleteEntity {
  @Column()
  public name: string;

  @Column({ nullable: true })
  public description: string;

  @ManyToMany(() => Permission, {
    cascade: true,
  })
  @JoinTable({
    name: ROLE_PERMISSION,
    joinColumn: {
      name: 'role_id',
      referencedColumnName: 'id',
    },
    inverseJoinColumn: {
      name: 'permission_id',
      referencedColumnName: 'id',
    },
  })
  permissions: Permission[];

  @Column({ default: STATUS.ACTIVE })
  public status: STATUS;

  @Column({ nullable: true, unique: true })
  public code: string;

  @Column({ nullable: true })
  public user_id?: number;
  @ManyToOne('Users', 'created_roles')
  @JoinColumn({ name: 'user_id' })
  public creator?: Users;

  // Inverse relations
  @OneToMany('UserRole', 'role')
  user_roles?: UserRole[];

  @ManyToMany('DataAccess', 'roles')
  data_access_rules?: DataAccess[];
}
