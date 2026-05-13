import { DataSource } from 'typeorm';
import { getOrmConfig } from '../datasource';
import { DB_HOST, DB_NAME, DB_PASSWORD, DB_PORT, DB_USERNAME } from '@configuration/env.config';

interface ExtractedAdminAuthor {
  report_id: number;
  creator_email: string | null;
  updater_email: string | null;
}

interface UserRelation {
  id: number;
  created_by_admin_id: number | null;
  updated_by_admin_id: number | null;
}

interface ExtractedLabelLink {
  diagnostic_report_id: number;
  label_id: number;
}

export class BiHubDiagnosticReportRelationDataMigration {
  private dataDestination: DataSource;
  private dataSource: DataSource;

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

    await this.migrateAdminAuthors();
    await this.migrateLabels();

    console.log(`[DiagnosticReportRelation] Migration completed.`);
  }

  // Resolve admin_users → users by email for created_by_admin_id / updated_by_admin_id
  private async migrateAdminAuthors() {
    const limit = 10000;
    let offset = 1;
    let isFetch = true;
    let count = 0;

    while (isFetch) {
      const raws = await this.extractAdminAuthors(offset, limit);
      if (raws.length === 0) break;

      const userRelations = await this.transformAdminAuthors(raws);
      await this.loadAdminAuthors(userRelations);

      if (raws.length < limit) {
        isFetch = false;
      }
      count += raws.length;
      offset += 1;
    }

    console.log(`  [AdminAuthors] Updated ${count} records.`);
  }

  private async extractAdminAuthors(offset: number, limit: number): Promise<ExtractedAdminAuthor[]> {
    const query = `
      SELECT
        r.id as report_id,
        creator.email as creator_email,
        updater.email as updater_email
      FROM bi_diagnostic_reports r
      LEFT JOIN admin_users creator ON r.created_by_id = creator.id
      LEFT JOIN admin_users updater ON r.updated_by_id = updater.id
      WHERE r.created_by_id IS NOT NULL OR r.updated_by_id IS NOT NULL
      ORDER BY r.id ASC
      LIMIT $1 OFFSET $2
    `;
    return this.dataSource.query(query, [limit, (offset - 1) * limit]);
  }

  private async transformAdminAuthors(data: ExtractedAdminAuthor[]): Promise<UserRelation[]> {
    // Collect unique emails from batch
    const emails = new Set<string>();
    data.forEach((item) => {
      if (item.creator_email) emails.add(item.creator_email);
      if (item.updater_email) emails.add(item.updater_email);
    });

    if (emails.size === 0) return [];

    // Bulk resolve emails against NestJS users table
    const users: { id: number; email: string }[] = await this.dataDestination.query(
      `SELECT id, email FROM users WHERE email = ANY($1)`,
      [Array.from(emails)],
    );
    const emailToUserId = new Map(users.map((u) => [u.email, u.id]));

    // Map to user relations, dedup by report_id
    const relationsMap = new Map<number, UserRelation>();
    data.forEach((item) => {
      if (!relationsMap.has(item.report_id)) {
        relationsMap.set(item.report_id, {
          id: item.report_id,
          created_by_admin_id: item.creator_email ? (emailToUserId.get(item.creator_email) ?? null) : null,
          updated_by_admin_id: item.updater_email ? (emailToUserId.get(item.updater_email) ?? null) : null,
        });
      }
    });

    return Array.from(relationsMap.values());
  }

  private async loadAdminAuthors(userRelations: UserRelation[]) {
    if (!userRelations.length) return;
    const query = `
      UPDATE bi_hub_diagnostic_reports d
      SET
        created_by_admin_id = x.created_by_admin_id,
        updated_by_admin_id = x.updated_by_admin_id
      FROM json_to_recordset($1::json)
      AS x(id INT, created_by_admin_id INT, updated_by_admin_id INT)
      WHERE d.id = x.id
    `;
    await this.dataDestination.query(query, [JSON.stringify(userRelations)]);
  }

  // Migrate labels junction: bi_diagnostic_reports_labels_lnk → diagnostic_reports_labels
  private async migrateLabels() {
    const limit = 10000;
    let offset = 1;
    let isFetch = true;
    let count = 0;

    while (isFetch) {
      const raws = await this.extractLabels(offset, limit);
      if (raws.length === 0) break;

      await this.loadLabels(raws);

      if (raws.length < limit) {
        isFetch = false;
      }
      count += raws.length;
      offset += 1;
    }

    console.log(`  [Labels] Migrated ${count} label links.`);
  }

  private async extractLabels(offset: number, limit: number): Promise<ExtractedLabelLink[]> {
    const query = `
      SELECT
        lnk.bi_diagnostic_report_id as diagnostic_report_id,
        lnk.bi_hub_label_id as label_id
      FROM bi_diagnostic_reports_labels_lnk lnk
      ORDER BY lnk.bi_diagnostic_report_id ASC
      LIMIT $1 OFFSET $2
    `;
    return this.dataSource.query(query, [limit, (offset - 1) * limit]);
  }

  private async loadLabels(data: ExtractedLabelLink[]) {
    if (!data.length) return;
    const query = `
      INSERT INTO diagnostic_reports_labels (diagnostic_report_id, label_id)
      SELECT x.diagnostic_report_id, x.label_id
      FROM json_to_recordset($1::json)
      AS x(diagnostic_report_id INT, label_id INT)
      INNER JOIN bi_hub_diagnostic_reports r ON r.id = x.diagnostic_report_id
      INNER JOIN bi_hub_labels l ON l.id = x.label_id
      ON CONFLICT DO NOTHING
    `;
    await this.dataDestination.query(query, [JSON.stringify(data)]);
  }
}
