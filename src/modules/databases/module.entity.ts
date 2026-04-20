import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Permission } from '@modules/databases/permission.entity';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';

@Entity('modules')
export class Module extends BaseSoftDeleteEntity {
  @Column({ nullable: true })
  public path: string;

  @Column()
  public name: string;

  @Column({ nullable: true })
  public table_name: string;

  @Column({ default: true })
  public is_active: boolean;

  @Column({ nullable: true })
  public parent_id?: number;
  @ManyToOne('Module', 'children')
  @JoinColumn({ name: 'parent_id' })
  public parent?: Module;

  // Inverse relations
  @OneToMany('Module', 'parent')
  children?: Module[];

  @OneToMany('Permission', 'module')
  permissions?: Permission[];
}
