import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { AssetHubPublisher } from '@modules/databases/asset-hub-publisher.entity';
import { AssetHubTag, AssetHubTagArtifactType } from '@modules/databases/asset-hub-tag.entity';
import { SkillPackageResponsible } from '@modules/databases/skill-package-responsible.entity';
import { PromptPackageResponsible } from '@modules/databases/prompt-package-responsible.entity';
import { SkillVersionTag } from '@modules/databases/skill-version-tag.entity';
import { PromptVersionTag } from '@modules/databases/prompt-version-tag.entity';

// Upper bounds shared by the create and bump DTOs; re-asserted here so a caller that bypasses
// the DTO layer (a seeder, a future internal caller) cannot write an unbounded fan-out.
export const MAX_RESPONSIBLE_USERS = 20;
export const MAX_VERSION_TAGS = 20;

// Which workspace a write belongs to. Picks the join entities and the tag artifact_type.
export type AssetHubWorkspace = 'skill' | 'prompt';

const RESPONSIBLE_ENTITY = {
  skill: SkillPackageResponsible,
  prompt: PromptPackageResponsible,
} as const;

const VERSION_TAG_ENTITY = {
  skill: SkillVersionTag,
  prompt: PromptVersionTag,
} as const;

const ARTIFACT_TYPE: Record<AssetHubWorkspace, AssetHubTagArtifactType> = {
  skill: AssetHubTagArtifactType.SKILL,
  prompt: AssetHubTagArtifactType.PROMPT,
};

const unique = (ids: number[]): number[] => [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];

// Validation + full-replace persistence for the package/version metadata both workspaces share:
// publishing unit, people in charge, and catalog tags. Every method takes the caller's
// transaction manager so the metadata lands atomically with the package/version rows.
@Injectable()
export class AssetHubItemMetaService {
  // 400 (not 404): the id arrives inside a create/bump body, so an unknown value is bad input.
  async assertPublisher(manager: EntityManager, publisherId: number): Promise<void> {
    const found = await manager
      .getRepository(AssetHubPublisher)
      .createQueryBuilder('p')
      .where('p.id = :id', { id: publisherId })
      .andWhere('p.deleted_at IS NULL')
      .andWhere('COALESCE(p.is_deleted, false) = false')
      .getCount();

    if (found === 0) throw new BadRequestException('INVALID_PUBLISHER: publisher does not exist');
  }

  // Every id must resolve to a live user. Reported as one error rather than per-id so the response
  // does not become a membership oracle for arbitrary user ids.
  async assertUsers(manager: EntityManager, userIds: number[]): Promise<number[]> {
    const ids = unique(userIds);
    if (ids.length === 0) {
      throw new BadRequestException('INVALID_RESPONSIBLE_USERS: at least one person in charge is required');
    }
    if (ids.length > MAX_RESPONSIBLE_USERS) {
      throw new BadRequestException(`INVALID_RESPONSIBLE_USERS: at most ${MAX_RESPONSIBLE_USERS} allowed`);
    }

    const rows: Array<{ id: number }> = await manager.query(
      `SELECT id FROM users
       WHERE id = ANY($1) AND deleted_at IS NULL AND COALESCE(is_deleted, false) = false`,
      [ids],
    );
    if (rows.length !== ids.length) {
      throw new BadRequestException('INVALID_RESPONSIBLE_USERS: one or more users do not exist');
    }
    return ids;
  }

  // Tags must be live AND belong to this workspace — a prompt tag on a skill version is rejected
  // rather than silently stored, since the pickers and filters are scoped by artifact_type.
  async assertTags(manager: EntityManager, tagIds: number[], workspace: AssetHubWorkspace): Promise<number[]> {
    const ids = unique(tagIds);
    if (ids.length === 0) return [];
    if (ids.length > MAX_VERSION_TAGS) {
      throw new BadRequestException(`INVALID_TAGS: at most ${MAX_VERSION_TAGS} tags allowed`);
    }

    const found = await manager
      .getRepository(AssetHubTag)
      .createQueryBuilder('t')
      .where('t.id IN (:...ids)', { ids })
      .andWhere('t.artifact_type = :artifact_type', { artifact_type: ARTIFACT_TYPE[workspace] })
      .andWhere('t.deleted_at IS NULL')
      .andWhere('COALESCE(t.is_deleted, false) = false')
      .getCount();

    if (found !== ids.length) {
      throw new BadRequestException('INVALID_TAGS: one or more tags do not exist for this asset type');
    }
    return ids;
  }

  // Full replace: the request body is the complete list, so prior links are hard-deleted first.
  // Same shape the diagnostic report uses for its PIC links.
  async replaceResponsibles(
    manager: EntityManager,
    workspace: AssetHubWorkspace,
    packageId: number,
    userIds: number[],
  ): Promise<void> {
    const entity = RESPONSIBLE_ENTITY[workspace];
    const ownerColumn = workspace === 'skill' ? 'skill_package_id' : 'prompt_package_id';

    await manager.delete(entity, { [ownerColumn]: packageId });
    const ids = unique(userIds);
    if (!ids.length) return;
    await manager.save(ids.map((user_id) => manager.create(entity, { [ownerColumn]: packageId, user_id })));
  }

  // Version tags are written once per version (a version is immutable after submit), but the
  // replace shape keeps a resubmit path idempotent.
  async replaceVersionTags(
    manager: EntityManager,
    workspace: AssetHubWorkspace,
    versionId: number,
    tagIds: number[],
  ): Promise<void> {
    const entity = VERSION_TAG_ENTITY[workspace];
    const ownerColumn = workspace === 'skill' ? 'skill_version_id' : 'prompt_version_id';

    await manager.delete(entity, { [ownerColumn]: versionId });
    const ids = unique(tagIds);
    if (!ids.length) return;
    await manager.save(ids.map((tag_id) => manager.create(entity, { [ownerColumn]: versionId, tag_id })));
  }
}
