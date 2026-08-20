import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AssetHubTag, AssetHubTagArtifactType, AssetHubTagKind } from '@modules/databases/asset-hub-tag.entity';
import { AssetHubPublisher } from '@modules/databases/asset-hub-publisher.entity';

export interface TagCatalogItem {
  id: number;
  name: string;
  kind: AssetHubTagKind;
  artifact_type: AssetHubTagArtifactType;
}

export interface PublisherCatalogItem {
  id: number;
  name: string;
}

// Read-only catalogs backing the create/edit form pickers. Seeded by migration; there is no
// admin CRUD surface, so this service only ever selects.
@Injectable()
export class AssetHubCatalogService {
  constructor(
    @InjectRepository(AssetHubTag)
    private readonly tagRepo: Repository<AssetHubTag>,
    @InjectRepository(AssetHubPublisher)
    private readonly publisherRepo: Repository<AssetHubPublisher>,
  ) {}

  // Soft-deleted rows are excluded on both axes: `deleted_at` (TypeORM's own marker, applied
  // automatically) and the paired `is_deleted` flag that the rest of the codebase also honors.
  async listTags(filters: {
    artifact_type?: AssetHubTagArtifactType;
    kind?: AssetHubTagKind;
  }): Promise<{ data: TagCatalogItem[] }> {
    const qb = this.tagRepo
      .createQueryBuilder('t')
      .select(['t.id', 't.name', 't.kind', 't.artifact_type'])
      .where('t.deleted_at IS NULL')
      .andWhere('COALESCE(t.is_deleted, false) = false');

    if (filters.artifact_type)
      qb.andWhere('t.artifact_type = :artifact_type', { artifact_type: filters.artifact_type });
    if (filters.kind) qb.andWhere('t.kind = :kind', { kind: filters.kind });

    const rows = await qb.orderBy('t.artifact_type', 'ASC').addOrderBy('t.name', 'ASC').getMany();

    return {
      data: rows.map((t) => ({ id: t.id, name: t.name, kind: t.kind, artifact_type: t.artifact_type })),
    };
  }

  async listPublishers(): Promise<{ data: PublisherCatalogItem[] }> {
    const rows = await this.publisherRepo
      .createQueryBuilder('p')
      .select(['p.id', 'p.name'])
      .where('p.deleted_at IS NULL')
      .andWhere('COALESCE(p.is_deleted, false) = false')
      .orderBy('p.id', 'ASC')
      .getMany();

    return { data: rows.map((p) => ({ id: p.id, name: p.name })) };
  }
}
