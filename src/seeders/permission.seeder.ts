import { Permission } from '@modules/databases/permission.entity';
import { Injectable } from '@nestjs/common';
import { Seeder } from 'nestjs-seeder';
import { DataSource } from 'typeorm';

interface PermissionSeedItem {
  id: number;
  code: string;
  name: string;
  method: string;
  action: string;
  is_active: boolean;
  module_id: number;
}

// ── Data Uploader / Workspace (module_id=2) ──────────────────────
const DATA_UPLOADER_WORKSPACE: PermissionSeedItem[] = [
  { id: 1, code: 'workspace_view', name: 'Xem', method: 'GET', action: 'read', is_active: true, module_id: 2 },
  { id: 2, code: 'workspace_create', name: 'Tạo mới', method: 'POST', action: 'create', is_active: true, module_id: 2 },
  { id: 3, code: 'workspace_edit', name: 'Sửa', method: 'PUT', action: 'update', is_active: true, module_id: 2 },
  { id: 4, code: 'workspace_delete', name: 'Xóa', method: 'DELETE', action: 'delete', is_active: true, module_id: 2 },
];

// ── Data Uploader / Template (module_id=3) ───────────────────────
const DATA_UPLOADER_TEMPLATE: PermissionSeedItem[] = [
  { id: 5, code: 'du_template_view', name: 'Xem', method: 'GET', action: 'read', is_active: true, module_id: 3 },
  {
    id: 6,
    code: 'du_template_create',
    name: 'Tạo mới',
    method: 'POST',
    action: 'create',
    is_active: true,
    module_id: 3,
  },
  { id: 7, code: 'du_template_edit', name: 'Sửa', method: 'PATCH', action: 'update', is_active: true, module_id: 3 },
  { id: 8, code: 'du_template_delete', name: 'Xóa', method: 'DELETE', action: 'delete', is_active: true, module_id: 3 },
  { id: 9, code: 'du_template_copy', name: 'Sao chép', method: 'POST', action: 'copy', is_active: true, module_id: 3 },
  {
    id: 10,
    code: 'du_template_approve',
    name: 'Duyệt',
    method: 'PATCH',
    action: 'approve',
    is_active: true,
    module_id: 3,
  },
  {
    id: 11,
    code: 'du_template_active',
    name: 'Kích hoạt',
    method: 'PATCH',
    action: 'active',
    is_active: true,
    module_id: 3,
  },
];

// ── Data Uploader / Document (module_id=4) ───────────────────────
const DATA_UPLOADER_DOCUMENT: PermissionSeedItem[] = [
  { id: 12, code: 'du_document_view', name: 'Xem', method: 'GET', action: 'read', is_active: true, module_id: 4 },
  {
    id: 13,
    code: 'du_document_upload',
    name: 'Upload',
    method: 'POST',
    action: 'upload',
    is_active: true,
    module_id: 4,
  },
  {
    id: 14,
    code: 'du_document_download',
    name: 'Download',
    method: 'GET',
    action: 'download',
    is_active: true,
    module_id: 4,
  },
  {
    id: 15,
    code: 'du_document_delete',
    name: 'Xóa',
    method: 'DELETE',
    action: 'delete',
    is_active: true,
    module_id: 4,
  },
  {
    id: 16,
    code: 'du_document_approve',
    name: 'Duyệt',
    method: 'PATCH',
    action: 'approve',
    is_active: true,
    module_id: 4,
  },
];

// ── BI Hub / BICC Department (module_id=6) ───────────────────────
const BI_HUB_BICC_DEPT: PermissionSeedItem[] = [
  { id: 17, code: 'bh_bicc_dept_view', name: 'Xem', method: 'GET', action: 'read', is_active: true, module_id: 6 },
  {
    id: 18,
    code: 'bh_bicc_dept_create',
    name: 'Tạo mới',
    method: 'POST',
    action: 'create',
    is_active: true,
    module_id: 6,
  },
  { id: 19, code: 'bh_bicc_dept_edit', name: 'Sửa', method: 'PUT', action: 'update', is_active: true, module_id: 6 },
  {
    id: 20,
    code: 'bh_bicc_dept_delete',
    name: 'Xóa',
    method: 'DELETE',
    action: 'delete',
    is_active: true,
    module_id: 6,
  },
];

// ── BI Hub / BI Hub Reports (module_id=7) ────────────────────────
const BI_HUB_REPORTS: PermissionSeedItem[] = [
  { id: 21, code: 'bh_report_view', name: 'Xem', method: 'GET', action: 'read', is_active: true, module_id: 7 },
  {
    id: 22,
    code: 'bh_report_create',
    name: 'Tạo mới',
    method: 'POST',
    action: 'create',
    is_active: true,
    module_id: 7,
  },
  { id: 23, code: 'bh_report_edit', name: 'Sửa', method: 'PUT', action: 'update', is_active: true, module_id: 7 },
  { id: 24, code: 'bh_report_delete', name: 'Xóa', method: 'DELETE', action: 'delete', is_active: true, module_id: 7 },
  {
    id: 25,
    code: 'bh_report_download',
    name: 'Tải xuống',
    method: 'GET',
    action: 'download',
    is_active: true,
    module_id: 7,
  },
];

// ── BI Hub / BI Diagnostic Report (module_id=8) ─────────────────
const BI_HUB_DIAG_REPORT: PermissionSeedItem[] = [
  { id: 30, code: 'bh_diag_report_view', name: 'Xem', method: 'GET', action: 'read', is_active: true, module_id: 8 },
  {
    id: 31,
    code: 'bh_diag_report_create',
    name: 'Tạo mới',
    method: 'POST',
    action: 'create',
    is_active: true,
    module_id: 8,
  },
  { id: 32, code: 'bh_diag_report_edit', name: 'Sửa', method: 'PUT', action: 'update', is_active: true, module_id: 8 },
  {
    id: 33,
    code: 'bh_diag_report_delete',
    name: 'Xóa',
    method: 'DELETE',
    action: 'delete',
    is_active: true,
    module_id: 8,
  },
  {
    id: 34,
    code: 'bh_diag_report_download',
    name: 'Tải xuống',
    method: 'GET',
    action: 'download',
    is_active: true,
    module_id: 8,
  },
];

// ── Permission Management / Vai trò (module_id=101) ─────────────
const PERM_MGMT_ROLE: PermissionSeedItem[] = [
  { id: 100, code: 'perm_role_view', name: 'Xem', method: 'GET', action: 'read', is_active: true, module_id: 101 },
  {
    id: 101,
    code: 'perm_role_create',
    name: 'Tạo mới',
    method: 'POST',
    action: 'create',
    is_active: true,
    module_id: 101,
  },
  {
    id: 102,
    code: 'perm_role_update',
    name: 'Chỉnh sửa',
    method: 'PUT',
    action: 'update',
    is_active: true,
    module_id: 101,
  },
  {
    id: 103,
    code: 'perm_role_delete',
    name: 'Xóa',
    method: 'DELETE',
    action: 'delete',
    is_active: true,
    module_id: 101,
  },
];

// ── Permission Management / Người dùng (module_id=102) ──────────
const PERM_MGMT_USER: PermissionSeedItem[] = [
  { id: 104, code: 'perm_user_view', name: 'Xem', method: 'GET', action: 'read', is_active: true, module_id: 102 },
];

// ── Permission Management / Phân quyền dữ liệu (module_id=103) ─
const PERM_MGMT_DATA_ACCESS: PermissionSeedItem[] = [
  {
    id: 105,
    code: 'perm_data_access_view',
    name: 'Xem',
    method: 'GET',
    action: 'read',
    is_active: true,
    module_id: 103,
  },
  {
    id: 106,
    code: 'perm_data_access_create',
    name: 'Tạo mới',
    method: 'POST',
    action: 'create',
    is_active: true,
    module_id: 103,
  },
  {
    id: 107,
    code: 'perm_data_access_delete',
    name: 'Xóa',
    method: 'DELETE',
    action: 'delete',
    is_active: true,
    module_id: 103,
  },
];

// ── Permission Management / Lịch sử thay đổi (module_id=104) ───
const PERM_MGMT_HISTORY: PermissionSeedItem[] = [
  { id: 108, code: 'perm_history_view', name: 'Xem', method: 'GET', action: 'read', is_active: true, module_id: 104 },
];

// ── Permission Management / Service Token (module_id=105) ─────────
const PERM_MGMT_SERVICE_TOKEN: PermissionSeedItem[] = [
  { id: 109, code: 'service_token_view', name: 'Xem', method: 'GET', action: 'read', is_active: true, module_id: 105 },
  {
    id: 110,
    code: 'service_token_create',
    name: 'Tạo mới',
    method: 'POST',
    action: 'create',
    is_active: true,
    module_id: 105,
  },
  {
    id: 111,
    code: 'service_token_edit',
    name: 'Sửa',
    method: 'PATCH',
    action: 'update',
    is_active: true,
    module_id: 105,
  },
  {
    id: 112,
    code: 'service_token_delete',
    name: 'Xóa',
    method: 'DELETE',
    action: 'delete',
    is_active: true,
    module_id: 105,
  },
];

// ── BI Payment (module_id=12,13,15) — 8-code program matrix ─────────
// 14 codes total: project 4 + program 8 + template lifecycle 2.
const BI_PAYMENT_PROJECT: PermissionSeedItem[] = [
  { id: 35, code: 'bp_project_view', name: 'Xem', method: 'GET', action: 'read', is_active: true, module_id: 12 },
  {
    id: 36,
    code: 'bp_project_create',
    name: 'Tạo mới',
    method: 'POST',
    action: 'create',
    is_active: true,
    module_id: 12,
  },
  { id: 37, code: 'bp_project_edit', name: 'Sửa', method: 'PUT', action: 'update', is_active: true, module_id: 12 },
  {
    id: 38,
    code: 'bp_project_delete',
    name: 'Xóa',
    method: 'DELETE',
    action: 'delete',
    is_active: true,
    module_id: 12,
  },
];

const BI_PAYMENT_PROGRAM: PermissionSeedItem[] = [
  { id: 39, code: 'bp_program_view', name: 'Xem', method: 'GET', action: 'read', is_active: true, module_id: 13 },
  {
    id: 40,
    code: 'bp_program_create',
    name: 'Tạo mới',
    method: 'POST',
    action: 'create',
    is_active: true,
    module_id: 13,
  },
  { id: 41, code: 'bp_program_edit', name: 'Sửa', method: 'PUT', action: 'update', is_active: true, module_id: 13 },
  {
    id: 42,
    code: 'bp_program_delete',
    name: 'Xóa',
    method: 'DELETE',
    action: 'delete',
    is_active: true,
    module_id: 13,
  },
  {
    id: 49,
    code: 'bp_program_upload',
    name: 'Upload',
    method: 'POST',
    action: 'upload',
    is_active: true,
    module_id: 13,
  },
  {
    id: 52,
    code: 'bp_program_upload_recon',
    name: 'Upload tra soát',
    method: 'POST',
    action: 'upload_recon',
    is_active: true,
    module_id: 13,
  },
  {
    id: 53,
    code: 'bp_program_approve',
    name: 'Approve',
    method: 'PATCH',
    action: 'approve',
    is_active: true,
    module_id: 13,
  },
  {
    id: 54,
    code: 'bp_program_confirm',
    name: 'Confirm',
    method: 'PATCH',
    action: 'confirm',
    is_active: true,
    module_id: 13,
  },
];

const BI_PAYMENT_TEMPLATE: PermissionSeedItem[] = [
  // Template visibility follows program upload capabilities; lifecycle verbs stay separate.
  {
    id: 50,
    code: 'bp_template_create',
    name: 'Tạo mới',
    method: 'POST',
    action: 'create',
    is_active: true,
    module_id: 15,
  },
  {
    id: 51,
    code: 'bp_template_delete',
    name: 'Xóa',
    method: 'DELETE',
    action: 'delete',
    is_active: true,
    module_id: 15,
  },
];

// ── MA Tool / Report (module_id=107) ─────────────────────────────
const MA_TOOL_REPORT: PermissionSeedItem[] = [
  { id: 113, code: 'ma_tool_report_view', name: 'Xem', method: 'GET', action: 'read', is_active: true, module_id: 107 },
];

@Injectable()
export class PermissionSeeder implements Seeder {
  constructor(private connection: DataSource) {}

  private dataRef: number[] = [];

  async seed(): Promise<void> {
    const dataConfig: PermissionSeedItem[] = [
      // Active modules
      ...DATA_UPLOADER_WORKSPACE,
      ...DATA_UPLOADER_TEMPLATE,
      ...DATA_UPLOADER_DOCUMENT,
      ...BI_HUB_BICC_DEPT,
      ...BI_HUB_REPORTS,
      ...BI_HUB_DIAG_REPORT,
      // MA Tool
      ...MA_TOOL_REPORT,
      // Permission Management
      ...PERM_MGMT_ROLE,
      ...PERM_MGMT_USER,
      ...PERM_MGMT_DATA_ACCESS,
      ...PERM_MGMT_HISTORY,
      ...PERM_MGMT_SERVICE_TOKEN,
      // BI Payment — project 4 + program 8 + template lifecycle 2
      ...BI_PAYMENT_PROJECT,
      ...BI_PAYMENT_PROGRAM,
      ...BI_PAYMENT_TEMPLATE,
    ];

    this.dataRef = dataConfig.map((item) => item.id);

    const tableName = this.connection.getMetadata(Permission).tableName;
    const existing = await this.connection.query<{ id: number }[]>(`SELECT id FROM ${tableName} WHERE "id" = ANY($1)`, [
      this.dataRef,
    ]);
    const existingIds = new Set(existing.map((r: { id: number }) => r.id));

    const toInsert = dataConfig.filter((item) => !existingIds.has(item.id));
    if (!toInsert.length) return;

    await this.connection.createQueryBuilder().insert().into(Permission).values(toInsert).execute();

    await this.connection.query(`SELECT setval('permission_id_seq', (SELECT COALESCE(MAX(id), 1) FROM ${tableName}))`);
  }

  async drop(): Promise<void> {
    if (!this.dataRef.length) return;
    await this.connection
      .createQueryBuilder()
      .delete()
      .from(Permission)
      .where('"id" IN (:...ids)', { ids: this.dataRef })
      .execute();
  }
}
