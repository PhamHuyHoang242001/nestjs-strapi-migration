import { MigrationInterface, QueryRunner } from 'typeorm';

// Child Asset Hub modules so each WS has its own table_name for own-all SO implied verbs.
// Parent 104 stays table_name NULL / path /asset-hub. Child paths are NOT prefixes of each other.
// Permission ids 108/109/114/115/117/118 stay; only module_id moves.

const PARENT_ID = 104;
const CHILDREN: Array<{
  path: string;
  name: string;
  tableName: string;
  permCodes: string[];
}> = [
  { path: '/asset-hub/skill', name: 'Asset Hub Skill', tableName: 'skill_packages', permCodes: ['skill_upload', 'skill_approve'] },
  { path: '/asset-hub/prompt', name: 'Asset Hub Prompt', tableName: 'prompt_packages', permCodes: ['prompt_upload', 'prompt_approve'] },
  {
    path: '/asset-hub/api-catalog',
    name: 'Asset Hub API Catalog',
    tableName: 'api_catalog_packages',
    permCodes: ['api_upload', 'api_approve'],
  },
  { path: '/asset-hub/coworker', name: 'Asset Hub Coworker', tableName: 'coworker_packages', permCodes: [] },
];

export class AiHubWorkspaceSoModules2610091600 implements MigrationInterface {
  name = 'AiHubWorkspaceSoModules2610091600';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const parent = (await queryRunner.query(
      `SELECT id, mpath FROM modules WHERE id = $1 AND deleted_at IS NULL`,
      [PARENT_ID],
    )) as Array<{ id: number; mpath: string }>;
    if (!parent[0]) throw new Error('Asset Hub module 104 missing; cannot insert child SO modules');

    const parentMpath = parent[0].mpath || `${PARENT_ID}.`;

    for (const child of CHILDREN) {
      const existing = (await queryRunner.query(`SELECT id FROM modules WHERE path = $1 AND deleted_at IS NULL`, [
        child.path,
      ])) as Array<{ id: number }>;

      let childId = existing[0] ? Number(existing[0].id) : 0;
      if (!childId) {
        const maxRows = (await queryRunner.query(`SELECT COALESCE(MAX(id), 0)::int AS max FROM modules`)) as Array<{
          max: number;
        }>;
        childId = Number(maxRows[0]?.max ?? 0) + 1;
        await queryRunner.query(
          `INSERT INTO modules (id, path, name, table_name, is_active, "parentId", mpath, created_at, updated_at)
           VALUES ($1, $2, $3, $4, true, $5, $6, NOW(), NOW())`,
          [childId, child.path, child.name, child.tableName, PARENT_ID, `${parentMpath}${childId}.`],
        );
      } else {
        await queryRunner.query(
          `UPDATE modules
           SET name = $2, table_name = $3, "parentId" = $4, mpath = $5, is_active = true, updated_at = NOW()
           WHERE id = $1`,
          [childId, child.name, child.tableName, PARENT_ID, `${parentMpath}${childId}.`],
        );
      }

      if (child.permCodes.length) {
        await queryRunner.query(
          `UPDATE permission SET module_id = $1, updated_at = NOW()
           WHERE code = ANY($2) AND deleted_at IS NULL`,
          [childId, child.permCodes],
        );
      }
    }

    await this.advanceIdSequence(queryRunner, 'modules');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const codes = CHILDREN.flatMap((c) => c.permCodes);
    if (codes.length) {
      await queryRunner.query(
        `UPDATE permission SET module_id = $1, updated_at = NOW() WHERE code = ANY($2) AND deleted_at IS NULL`,
        [PARENT_ID, codes],
      );
    }
    await queryRunner.query(`DELETE FROM modules WHERE path = ANY($1) AND "parentId" = $2`, [
      CHILDREN.map((c) => c.path),
      PARENT_ID,
    ]);
  }

  private async advanceIdSequence(queryRunner: QueryRunner, table: string): Promise<void> {
    const rows = (await queryRunner.query(`SELECT pg_get_serial_sequence($1, 'id') AS sequence_name`, [table])) as Array<{
      sequence_name?: string | null;
    }>;
    const sequenceName = rows[0]?.sequence_name;
    if (!sequenceName) return;
    await queryRunner.query(
      `SELECT setval($1::regclass, (SELECT COALESCE(MAX(id), 1) FROM "${table}"), true)`,
      [sequenceName],
    );
  }
}
