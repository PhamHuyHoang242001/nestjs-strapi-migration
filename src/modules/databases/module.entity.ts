import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Permission } from '@modules/databases/permission.entity';
import { Column, Entity, OneToMany, Tree, TreeChildren, TreeParent } from 'typeorm';

@Entity('modules')
@Tree('materialized-path')
export class Module extends BaseSoftDeleteEntity {
  @Column({ nullable: true })
  public path: string;

  @Column()
  public name: string;

  @Column({ nullable: true })
  public table_name: string;

  @Column({ default: true })
  public is_active: boolean;

  @TreeParent()
  public parent?: Module;

  @TreeChildren()
  children?: Module[];

  @OneToMany('Permission', 'module')
  permissions?: Permission[];
}
