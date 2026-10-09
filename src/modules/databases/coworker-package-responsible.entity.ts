import { Column, Entity } from 'typeorm';
import { BaseSoftDeleteEntity } from '@configuration/base-entity';

@Entity('coworker_package_responsibles')
export class CoworkerPackageResponsible extends BaseSoftDeleteEntity {
  @Column({ type: 'int' })
  public coworker_package_id: number;

  @Column({ type: 'int' })
  public user_id: number;
}
