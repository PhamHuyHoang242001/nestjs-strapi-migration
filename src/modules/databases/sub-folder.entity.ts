import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';

// Self-referential folder hierarchy for MA Tool file organization
@Entity('sub_folders')
export class SubFolder extends BaseSoftDeleteEntity {
  @Column({ nullable: true })
  public path_name: string;

  @Column({ nullable: true })
  public folder_status: string;

  // user_created_id: plain nullable int, no decorator
  @Column({ nullable: true, type: 'int' })
  public user_created_id: number;

  // user_updated_id: plain nullable int, no decorator
  @Column({ nullable: true, type: 'int' })
  public user_updated_id: number;

  // Self-referential parent FK
  @Column({ nullable: true, type: 'int' })
  public parent_id: number;

  @ManyToOne(() => SubFolder, (f) => f.children)
  @JoinColumn({ name: 'parent_id' })
  public parent: SubFolder;

  @OneToMany(() => SubFolder, (f) => f.parent)
  public children: SubFolder[];
}
