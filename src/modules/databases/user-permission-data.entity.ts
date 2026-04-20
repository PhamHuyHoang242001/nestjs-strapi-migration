import { SCOPE_TYPE } from '@common/enums';
import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { DataAccess } from '@modules/databases/data-access.entity';
import { Permission } from '@modules/databases/permission.entity';
import { Users } from '@modules/databases/user.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

@Entity('user_permission_data')
export class UserPermissionData extends BaseSoftDeleteEntity {
  @Column()
  public data_access_id: number;
  @ManyToOne('DataAccess', 'user_permission_data')
  @JoinColumn({ name: 'data_access_id' })
  public data_access?: DataAccess;

  @Column()
  public permission_id: number;
  @ManyToOne('Permission', 'user_permission_data')
  @JoinColumn({ name: 'permission_id' })
  public permission?: Permission;

  @Column()
  public user_id: number;
  @ManyToOne('Users', 'user_permission_data')
  @JoinColumn({ name: 'user_id' })
  public user?: Users;

  @Column({ enum: SCOPE_TYPE })
  public scope_type: SCOPE_TYPE;

  @Column({ nullable: true, type: 'timestamp without time zone' })
  public start_date: Date;

  @Column({ nullable: true, type: 'timestamp without time zone' })
  public end_date: Date;
}
