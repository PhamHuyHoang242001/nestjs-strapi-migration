import { Module } from '@modules/databases/module.entity';
import { Injectable } from '@nestjs/common';
import { Seeder } from 'nestjs-seeder';
import { DataSource } from 'typeorm';

interface ModuleSeedItem {
  id: number;
  path: string;
  name: string;
  table_name: string | null;
  is_active: boolean;
  parent_id: number | null;
}

// ── Data Uploader ────────────────────────────────────────────────
const DATA_UPLOADER: ModuleSeedItem[] = [
  { id: 1, path: '/data-uploader', name: 'Data Uploader', table_name: null, is_active: true, parent_id: null },
  { id: 2, path: '/data-uploader/workspace', name: 'Workspace', table_name: 'ma_tool_workspaces', is_active: true, parent_id: 1 },
  { id: 3, path: '/data-uploader/workspace/template', name: 'Template', table_name: 'ma_tool_templates', is_active: true, parent_id: 2 },
  { id: 4, path: '/data-uploader/workspace/template/document', name: 'Document', table_name: 'ma_tool_documents', is_active: true, parent_id: 3 },
];

// ── BI Hub ───────────────────────────────────────────────────────
const BI_HUB: ModuleSeedItem[] = [
  { id: 5, path: '/bi-hub', name: 'BI Hub', table_name: null, is_active: true, parent_id: null },
  { id: 6, path: '/bi-hub/bicc-department', name: 'BICC Department', table_name: 'bi_hub_bicc_departments', is_active: true, parent_id: 5 },
  { id: 7, path: '/bi-hub/bicc-department/bi-hub-reports', name: 'BI Hub Reports', table_name: 'bi_hub_reports', is_active: true, parent_id: 6 },
  { id: 8, path: '/bi-hub/bicc-department/bi-diagnostic-category', name: 'BI Diagnostic Category', table_name: 'bi_diagnostic_categories', is_active: true, parent_id: 6 },
  { id: 9, path: '/bi-hub/bicc-department/bi-diagnostic-category/bi-diagnostic-report', name: 'BI Diagnostic Report', table_name: 'bi_diagnostic_reports', is_active: true, parent_id: 8 },
];

// ── BI Payment — TEMPORARILY DISABLED ────────────────────────────
// Uncomment when BI Payment modules are ready for seeding
/*
const BI_PAYMENT: ModuleSeedItem[] = [
  { id: 10, path: '/bi-payment', name: 'BI Payment', table_name: null, is_active: true, parent_id: null },
  { id: 11, path: '/bi-payment/bicc-department', name: 'BICC Department', table_name: null, is_active: true, parent_id: 10 },
  { id: 12, path: '/bi-payment/bicc-department/project', name: 'Project', table_name: 'bi_payment_projects', is_active: true, parent_id: 11 },
  { id: 13, path: '/bi-payment/bicc-department/project/program', name: 'Program', table_name: 'bi_payment_programs', is_active: true, parent_id: 12 },
  { id: 14, path: '/bi-payment/bicc-department/project/program/workstep', name: 'Work Step', table_name: 'bi_payment_work_steps', is_active: true, parent_id: 13 },
  { id: 15, path: '/bi-payment/bicc-department/project/program/template', name: 'Template', table_name: 'ma_tool_templates', is_active: true, parent_id: 13 },
  { id: 16, path: '/bi-payment/bicc-department/project/program/document', name: 'Document', table_name: 'ma_tool_documents', is_active: true, parent_id: 13 },
  { id: 17, path: '/bi-payment/bicc-department/project/program/checklist', name: 'Checklist', table_name: 'bi_payment_checklists', is_active: true, parent_id: 13 },
  { id: 18, path: '/bi-payment/bicc-department/project/program/other-file', name: 'Other File', table_name: 'bi_payment_other_files', is_active: true, parent_id: 13 },
];
*/

@Injectable()
export class ModuleSeeder implements Seeder {
  constructor(private connection: DataSource) {}

  private dataRef: number[] = [];

  async seed(): Promise<void> {
    const dataConfig: ModuleSeedItem[] = [
      ...DATA_UPLOADER,
      ...BI_HUB,
      // BI Payment — temporarily disabled (uncomment when ready)
      // ...BI_PAYMENT,
    ];

    this.dataRef = dataConfig.map((item) => item.id);

    const tableName = this.connection.getMetadata(Module).tableName;
    const existing = await this.connection.query<{ id: number }[]>(`SELECT id FROM ${tableName} WHERE "id" = ANY($1)`, [
      this.dataRef,
    ]);
    const existingIds = new Set(existing.map((r: { id: number }) => r.id));

    const toInsert = dataConfig.filter((item) => !existingIds.has(item.id));
    if (!toInsert.length) return;

    // Build parent lookup from dataConfig for mpath computation
    const parentMap = new Map<number, number | null>();
    for (const item of dataConfig) {
      parentMap.set(item.id, item.parent_id);
    }

    // Compute materialized path for each item (TypeORM format: "parentId.childId.")
    const computeMpath = (id: number): string => {
      const chain: number[] = [];
      let current: number | null = id;
      while (current !== null) {
        chain.unshift(current);
        current = parentMap.get(current) ?? null;
      }
      return chain.join('.') + '.';
    };

    // Insert with mpath column so TypeORM tree queries work correctly
    for (const item of toInsert) {
      const mpath = computeMpath(item.id);
      await this.connection.query(
        `INSERT INTO ${tableName} (id, path, name, table_name, is_active, "parentId", mpath, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
        [item.id, item.path, item.name, item.table_name, item.is_active, item.parent_id, mpath],
      );
    }

    await this.connection.query(`SELECT setval('modules_id_seq', (SELECT COALESCE(MAX(id), 1) FROM ${tableName}))`);
  }

  async drop(): Promise<void> {
    if (!this.dataRef.length) return;
    await this.connection
      .createQueryBuilder()
      .delete()
      .from(Module)
      .where('"id" IN (:...ids)', { ids: this.dataRef })
      .execute();
  }
}
