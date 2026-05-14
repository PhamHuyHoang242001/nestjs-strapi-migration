import { DataSource } from 'typeorm';
import { getOrmConfig } from '../datasource';
import { DB_HOST, DB_NAME, DB_PASSWORD, DB_PORT, DB_USERNAME } from '@configuration/env.config';

interface ExtractedWorkspaceAuthor {
  workspace_id: number;
  creator_email: string | null;
  updater_email: string | null;
}

interface WorkspaceAuthorRelation {
  id: number;
  created_by_user_id: number | null;
  updated_by_user_id: number | null;
}

interface ExtractedSharingTemplateLink {
  template_id: number;
  workspace_id: number;
}

interface SharingTemplateSource {
  tableName: string;
  templateColumn: string;
  workspaceColumn: string;
}

interface TransformedRelations {
  userRelations: WorkspaceAuthorRelation[];
  sharingTemplateRelations: ExtractedSharingTemplateLink[];
}

export class MaToolWorkspaceRelationDataMigration {
  private dataDestination: DataSource;
  private dataSource: DataSource;
  private createdByColumn: string | null = null;
  private updatedByColumn: string | null = null;
  private sharingTemplateSource: SharingTemplateSource | null = null;

  constructor(data: { db_host: string; db_port: string; db_username: string; db_name: string; db_password: string }) {
    this.dataDestination = new DataSource(
      getOrmConfig({
        host: DB_HOST,
        port: DB_PORT,
        username: DB_USERNAME,
        password: DB_PASSWORD,
        db_name: DB_NAME,
      }),
    );

    this.dataSource = new DataSource(
      getOrmConfig({
        host: data.db_host,
        port: +data.db_port,
        username: data.db_username,
        password: data.db_password,
        db_name: data.db_name,
      }),
    );
  }

  async run() {
    await this.dataDestination.initialize();
    await this.dataSource.initialize();
    await this.prepareSourceShape();

    await this.ensureSharingTemplateTargetTable();

    const limit = 10000;
    let offset = 1;
    let isFetch = true;
    let count = 0;

    while (isFetch) {
      const raws = await this.extract(offset, limit);
      const transformed = await this.transform(raws);
      await this.load(transformed);

      if (raws.length < limit) {
        isFetch = false;
      }

      count += raws.length;
      offset += 1;
    }

    const sharingTemplateRelations = await this.extractSharingTemplates();
    await this.load({ userRelations: [], sharingTemplateRelations });

    console.log(`[MaToolWorkspaceRelation] Migrate ${count} records completed.`);
  }

  async prepareSourceShape() {
    this.createdByColumn = await this.firstExistingColumn('ma_tool_workspaces', ['created_by_id', 'created_by']);
    this.updatedByColumn = await this.firstExistingColumn('ma_tool_workspaces', ['updated_by_id', 'updated_by']);
    this.sharingTemplateSource = await this.resolveSharingTemplateSource();
  }

  async extract(offset: number, limit: number): Promise<ExtractedWorkspaceAuthor[]> {
    if (!this.createdByColumn && !this.updatedByColumn) return [];

    const creatorJoin = this.createdByColumn
      ? `LEFT JOIN admin_users creator ON w.${this.createdByColumn} = creator.id`
      : '';
    const updaterJoin = this.updatedByColumn
      ? `LEFT JOIN admin_users updater ON w.${this.updatedByColumn} = updater.id`
      : '';
    const creatorSelect = this.createdByColumn ? 'creator.email' : 'NULL';
    const updaterSelect = this.updatedByColumn ? 'updater.email' : 'NULL';
    const where = [
      this.createdByColumn ? `w.${this.createdByColumn} IS NOT NULL` : null,
      this.updatedByColumn ? `w.${this.updatedByColumn} IS NOT NULL` : null,
    ]
      .filter(Boolean)
      .join(' OR ');

    const query = `
      SELECT
        w.id AS workspace_id,
        ${creatorSelect} AS creator_email,
        ${updaterSelect} AS updater_email
      FROM ma_tool_workspaces w
      ${creatorJoin}
      ${updaterJoin}
      WHERE w.workspace_status <> 'draft'
        AND (${where})
      ORDER BY w.id ASC
      LIMIT $1 OFFSET $2
    `;
    return this.dataSource.query(query, [limit, (offset - 1) * limit]);
  }

  async transform(data: ExtractedWorkspaceAuthor[]): Promise<TransformedRelations> {
    const emails = data.flatMap((item) => [item.creator_email, item.updater_email]).filter(Boolean);
    const emailToUserId = await this.resolveUserIdsByEmail(emails);
    const userRelations = data.map((item) => {
      const createdByUserId = item.creator_email ? (emailToUserId.get(item.creator_email.toLowerCase()) ?? null) : null;
      const updatedByUserId = item.updater_email ? (emailToUserId.get(item.updater_email.toLowerCase()) ?? null) : null;

      if (item.creator_email && !createdByUserId)
        this.logUnresolvedEmail('WorkspaceAuthors.created_by', item.workspace_id, item.creator_email);
      if (item.updater_email && !updatedByUserId)
        this.logUnresolvedEmail('WorkspaceAuthors.updated_by', item.workspace_id, item.updater_email);

      return {
        id: item.workspace_id,
        created_by_user_id: createdByUserId,
        updated_by_user_id: updatedByUserId,
      };
    });

    return {
      userRelations,
      sharingTemplateRelations: [],
    };
  }

  async load({ userRelations, sharingTemplateRelations }: TransformedRelations) {
    if (userRelations.length) {
      const queryUser = `
        UPDATE ma_tool_workspaces w
        SET
          created_by_user_id = x.created_by_user_id,
          updated_by_user_id = x.updated_by_user_id
        FROM json_to_recordset($1::json)
        AS x(id INT, created_by_user_id INT, updated_by_user_id INT)
        WHERE w.id = x.id
      `;
      await this.dataDestination.query(queryUser, [JSON.stringify(userRelations)]);
    }

    if (sharingTemplateRelations.length) {
      const querySharingTemplate = `
        INSERT INTO ma_tool_workspaces_sharing_templates (template_id, workspace_id)
        SELECT x.template_id, x.workspace_id
        FROM json_to_recordset($1::json)
        AS x(template_id INT, workspace_id INT)
        INNER JOIN ma_tool_templates t ON t.id = x.template_id
        INNER JOIN ma_tool_workspaces w ON w.id = x.workspace_id
        ON CONFLICT DO NOTHING
      `;
      await this.dataDestination.query(querySharingTemplate, [JSON.stringify(sharingTemplateRelations)]);
    }
  }

  async resolveSharingTemplateSource(): Promise<SharingTemplateSource | null> {
    const candidates: SharingTemplateSource[] = [
      {
        tableName: 'ma_tool_templates_exploit_workspaces_lnk',
        templateColumn: 'ma_tool_template_id',
        workspaceColumn: 'ma_tool_workspace_id',
      },
      {
        tableName: 'ma_tool_workspaces_sharing_templates_lnk',
        templateColumn: 'ma_tool_template_id',
        workspaceColumn: 'ma_tool_workspace_id',
      },
      {
        tableName: 'ma_tool_workspaces_sharing_templates',
        templateColumn: 'template_id',
        workspaceColumn: 'workspace_id',
      },
      {
        tableName: 'ma_tool_templates_ma_tool_workspaces',
        templateColumn: 'ma_tool_templates_id',
        workspaceColumn: 'ma_tool_workspaces_id',
      },
    ];

    for (const candidate of candidates) {
      const isMatch =
        (await this.hasTable(candidate.tableName)) &&
        (await this.hasColumn(candidate.tableName, candidate.templateColumn)) &&
        (await this.hasColumn(candidate.tableName, candidate.workspaceColumn));
      if (isMatch) return candidate;
    }

    return null;
  }

  async ensureSharingTemplateTargetTable() {
    await this.dataDestination.query(`
      CREATE TABLE IF NOT EXISTS ma_tool_workspaces_sharing_templates (
        template_id INT NOT NULL,
        workspace_id INT NOT NULL,
        CONSTRAINT ma_tool_workspaces_sharing_templates_pk PRIMARY KEY (template_id, workspace_id)
      )
    `);
  }

  async extractSharingTemplates(): Promise<ExtractedSharingTemplateLink[]> {
    const source = this.sharingTemplateSource;
    if (!source) return [];

    const query = `
      SELECT
        ${source.templateColumn} AS template_id,
        ${source.workspaceColumn} AS workspace_id
      FROM ${source.tableName}
      ORDER BY ${source.templateColumn} ASC, ${source.workspaceColumn} ASC
    `;
    return this.dataSource.query(query);
  }

  async hasTable(tableName: string): Promise<boolean> {
    const rows: { exists: boolean }[] = await this.dataSource.query(`SELECT to_regclass($1) IS NOT NULL AS exists`, [
      `public.${tableName}`,
    ]);
    return rows[0]?.exists ?? false;
  }

  async hasColumn(tableName: string, columnName: string): Promise<boolean> {
    const rows: { exists: boolean }[] = await this.dataSource.query(
      `
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = $1
            AND column_name = $2
        ) AS exists
      `,
      [tableName, columnName],
    );
    return rows[0]?.exists ?? false;
  }

  async firstExistingColumn(tableName: string, candidates: string[]): Promise<string | null> {
    for (const column of candidates) {
      if (await this.hasColumn(tableName, column)) return column;
    }
    return null;
  }

  async resolveUserIdsByEmail(emails: string[]): Promise<Map<string, number>> {
    const normalizedEmails = Array.from(new Set(emails.filter(Boolean).map((email) => email.toLowerCase())));
    if (!normalizedEmails.length) return new Map();

    const users: { id: number; email: string }[] = await this.dataDestination.query(
      `SELECT id, email FROM users WHERE LOWER(email) = ANY($1)`,
      [normalizedEmails],
    );

    return new Map(users.filter((user) => user.email).map((user) => [user.email.toLowerCase(), user.id]));
  }

  logUnresolvedEmail(scope: string, recordId: number, email: string | null) {
    if (email) {
      console.warn(`  [${scope}] Could not resolve email "${email}" for record ${recordId}.`);
    }
  }
}
