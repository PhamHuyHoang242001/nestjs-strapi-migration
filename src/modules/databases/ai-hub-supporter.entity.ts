import { Column, Entity } from 'typeorm';
import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import type { AiHubArtifactType } from '@modules/asset-hub-catalog/ai-hub-package-access.helper';

// Extra editors (not authors/PIC). Package-scoped. Writes are full-replace hard-delete like PIC.
@Entity('ai_hub_supporters')
export class AiHubSupporter extends BaseSoftDeleteEntity {
  @Column({ type: 'int' })
  public data_id: number;

  @Column({ type: 'varchar', length: 20 })
  public type: AiHubArtifactType;

  @Column({ type: 'int' })
  public user_id: number;
}
