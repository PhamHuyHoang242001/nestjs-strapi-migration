import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Module } from '@modules/databases/module.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

@Entity()
export class Permission extends BaseSoftDeleteEntity {
  @Column({ nullable: false })
  name: string;

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
}
