import { IsString } from 'class-validator';
import { Column, Entity } from 'typeorm';
import { BaseSoftDeleteEntity } from '@configuration/base-entity';

// Seeded catalog of publishing units. Shared by skill and prompt packages — a package
// stores publisher_id as a plain int (no TypeORM relation), resolved by an explicit join
// in the read services, the same shape used for category_id.
@Entity('ai_hub_publishers')
export class AssetHubPublisher extends BaseSoftDeleteEntity {
  @Column({ type: 'varchar', length: 200 })
  @IsString()
  public name: string;
}
