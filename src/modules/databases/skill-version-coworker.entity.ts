import { Column, Entity } from 'typeorm';
import { BaseSoftDeleteEntity } from '@configuration/base-entity';

// Version ↔ coworker_packages. Replaces skill_version_tags → ai_hub_tags (legacy coworker catalog).
@Entity('skill_version_coworkers')
export class SkillVersionCoworker extends BaseSoftDeleteEntity {
  @Column({ type: 'int' })
  public skill_version_id: number;

  @Column({ type: 'int' })
  public coworker_package_id: number;
}
