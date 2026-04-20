import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Module } from '@modules/databases/module.entity';
import { UserPermissionData } from '@modules/databases/user-permission-data.entity';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';

@Entity()
export class Permission extends BaseSoftDeleteEntity {
  @Column({ nullable: false })
  name: string;
  /**
   * synctax model_feature
   */
  @Column({ nullable: false })
  code: string;

  @Column({ nullable: false })
  method: string;

  @Column({ nullable: false })
  action: string;

  @Column({ default: true })
  public is_active: boolean;

  @Column({ nullable: true })
  public module_id?: number;
  @ManyToOne('Module', 'permissions')
  @JoinColumn({ name: 'module_id' })
  public module?: Module;

  // Inverse relations
  @OneToMany('UserPermissionData', 'permission')
  user_permission_data?: UserPermissionData[];
}
