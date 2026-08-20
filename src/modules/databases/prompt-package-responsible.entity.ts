import { Column, Entity, Index } from 'typeorm';
import { BaseSoftDeleteEntity } from '@configuration/base-entity';

// PIC (person-in-charge) link between a user and a prompt package. Relation-free by design:
// rows are read/written by explicit id joins so the package/user entities stay decoupled,
// matching bi_hub_diagnostic_report_pics. Writes are full-replace inside the create/bump tx.
@Entity('prompt_package_responsibles')
@Index(['prompt_package_id'])
@Index(['user_id'])
export class PromptPackageResponsible extends BaseSoftDeleteEntity {
  @Column({ type: 'int' })
  public prompt_package_id: number;

  @Column({ type: 'int' })
  public user_id: number;
}
