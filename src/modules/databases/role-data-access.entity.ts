import { SCOPE_TYPE } from '@common/enums';
import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { DataAccess } from '@modules/databases/data-access.entity';
import { Role } from '@modules/databases/role.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

@Entity('role_data_access')
export class RoleDataAccess extends BaseSoftDeleteEntity {
  @Column()
  public role_id: number;
  @ManyToOne('Role', 'role_data_access')
  @JoinColumn({ name: 'role_id' })
  public role?: Role;

  @Column()
  public data_access_id: number;
  @ManyToOne('DataAccess', 'role_data_access')
  @JoinColumn({ name: 'data_access_id' })
  public data_access?: DataAccess;

  @Column({ enum: SCOPE_TYPE })
  public scope_type: SCOPE_TYPE;

  @Column({ nullable: true, type: 'timestamp without time zone' })
  public start_date: Date;

  @Column({ nullable: true, type: 'timestamp without time zone' })
  public end_date: Date;
}
