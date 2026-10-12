import { Column, Entity } from 'typeorm';
import { BaseSoftDeleteEntity } from '@configuration/base-entity';

// Version ↔ coworker_packages. Replaces prompt_version_tags → ai_hub_tags (legacy coworker catalog).
@Entity('prompt_version_coworkers')
export class PromptVersionCoworker extends BaseSoftDeleteEntity {
  @Column({ type: 'int' })
  public prompt_version_id: number;

  @Column({ type: 'int' })
  public coworker_package_id: number;
}
