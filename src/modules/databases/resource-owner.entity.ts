import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Role } from '@modules/databases/role.entity';
import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';

// Polymorphic owner junction: links any root resource to a role via (resource_type, resource_id)
@Entity('resource_owners')
@Unique(['resource_type', 'resource_id', 'role_id'])
export class ResourceOwner extends BaseSoftDeleteEntity {
  @Column({ type: 'varchar', length: 50 })
  @Index()
  resource_type: string;

  @Column()
  resource_id: number;

  @Column()
  role_id: number;

  @ManyToOne(() => Role)
  @JoinColumn({ name: 'role_id' })
  role: Role;
}
