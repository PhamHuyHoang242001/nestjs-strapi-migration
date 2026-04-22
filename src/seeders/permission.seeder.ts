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

@Injectable()
export class PermissionSeeder implements Seeder {
  constructor(private connection: DataSource) {}

  private dataRef: number[] = [];

  async seed(): Promise<void> {
    const dataConfig: PermissionSeedItem[] = [
      // Data Uploader / Workspace (module_id=2)
      { id: 1, code: 'workspace_view', name: 'Xem', method: 'GET', action: 'read', is_active: true, module_id: 2 },
      {
        id: 2,
        code: 'workspace_create',
        name: 'Tạo mới',
        method: 'POST',
        action: 'create',
        is_active: true,
        module_id: 2,
      },
      { id: 3, code: 'workspace_edit', name: 'Sửa', method: 'PUT', action: 'update', is_active: true, module_id: 2 },
      {
        id: 4,
        code: 'workspace_delete',
        name: 'Xóa',
        method: 'DELETE',
        action: 'delete',
        is_active: true,
        module_id: 2,
      },
      // Data Uploader / Template (module_id=3)
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
      {
        id: 7,
        code: 'du_template_edit',
        name: 'Sửa',
        method: 'PATCH',
        action: 'update',
        is_active: true,
        module_id: 3,
      },
      {
        id: 8,
        code: 'du_template_delete',
        name: 'Xóa',
        method: 'DELETE',
        action: 'delete',
        is_active: true,
        module_id: 3,
      },
      {
        id: 9,
        code: 'du_template_copy',
        name: 'Sao chép',
        method: 'POST',
        action: 'copy',
        is_active: true,
        module_id: 3,
      },
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
      // Data Uploader / Document (module_id=4)
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
      // BI Hub / BICC Department (module_id=6)
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
      {
        id: 19,
        code: 'bh_bicc_dept_edit',
        name: 'Sửa',
        method: 'PUT',
        action: 'update',
        is_active: true,
        module_id: 6,
      },
      {
        id: 20,
        code: 'bh_bicc_dept_delete',
        name: 'Xóa',
        method: 'DELETE',
        action: 'delete',
        is_active: true,
        module_id: 6,
      },
      // BI Hub / BI Hub Reports (module_id=7)
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
      {
        id: 24,
        code: 'bh_report_delete',
        name: 'Xóa',
        method: 'DELETE',
        action: 'delete',
        is_active: true,
        module_id: 7,
      },
      {
        id: 25,
        code: 'bh_report_download',
        name: 'Tải xuống',
        method: 'GET',
        action: 'download',
        is_active: true,
        module_id: 7,
      },
      // BI Hub / BI Diagnostic Category (module_id=8)
      { id: 26, code: 'bh_diag_cat_view', name: 'Xem', method: 'GET', action: 'read', is_active: true, module_id: 8 },
      {
        id: 27,
        code: 'bh_diag_cat_create',
        name: 'Tạo mới',
        method: 'POST',
        action: 'create',
        is_active: true,
        module_id: 8,
      },
      { id: 28, code: 'bh_diag_cat_edit', name: 'Sửa', method: 'PUT', action: 'update', is_active: true, module_id: 8 },
      {
        id: 29,
        code: 'bh_diag_cat_delete',
        name: 'Xóa',
        method: 'DELETE',
        action: 'delete',
        is_active: true,
        module_id: 8,
      },
      // BI Hub / BI Diagnostic Report (module_id=9)
      {
        id: 30,
        code: 'bh_diag_report_view',
        name: 'Xem',
        method: 'GET',
        action: 'read',
        is_active: true,
        module_id: 9,
      },
      {
        id: 31,
        code: 'bh_diag_report_create',
        name: 'Tạo mới',
        method: 'POST',
        action: 'create',
        is_active: true,
        module_id: 9,
      },
      {
        id: 32,
        code: 'bh_diag_report_edit',
        name: 'Sửa',
        method: 'PUT',
        action: 'update',
        is_active: true,
        module_id: 9,
      },
      {
        id: 33,
        code: 'bh_diag_report_delete',
        name: 'Xóa',
        method: 'DELETE',
        action: 'delete',
        is_active: true,
        module_id: 9,
      },
      {
        id: 34,
        code: 'bh_diag_report_download',
        name: 'Tải xuống',
        method: 'GET',
        action: 'download',
        is_active: true,
        module_id: 9,
      },
      // BI Payment / Project (module_id=12)
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
      // BI Payment / Program (module_id=13)
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
        id: 43,
        code: 'bp_program_duplicate',
        name: 'Nhân bản',
        method: 'POST',
        action: 'duplicate',
        is_active: true,
        module_id: 13,
      },
      // BI Payment / Work Step (module_id=14)
      {
        id: 44,
        code: 'bp_ws_start',
        name: 'Bắt đầu',
        method: 'PATCH',
        action: 'start_program',
        is_active: true,
        module_id: 14,
      },
      {
        id: 45,
        code: 'bp_ws_preparing',
        name: 'Chuẩn bị',
        method: 'PATCH',
        action: 'preparing',
        is_active: true,
        module_id: 14,
      },
      {
        id: 46,
        code: 'bp_ws_calculating',
        name: 'Tính toán',
        method: 'PATCH',
        action: 'calculating',
        is_active: true,
        module_id: 14,
      },
      {
        id: 47,
        code: 'bp_ws_reconciliation',
        name: 'Đối soát',
        method: 'PATCH',
        action: 'reconciliation',
        is_active: true,
        module_id: 14,
      },
      {
        id: 48,
        code: 'bp_ws_exception',
        name: 'Ngoại lệ',
        method: 'PATCH',
        action: 'exception',
        is_active: true,
        module_id: 14,
      },
      {
        id: 49,
        code: 'bp_ws_waiting_approval',
        name: 'Chờ duyệt',
        method: 'PATCH',
        action: 'waiting_approval',
        is_active: true,
        module_id: 14,
      },
      {
        id: 50,
        code: 'bp_ws_release',
        name: 'Giải ngân',
        method: 'PATCH',
        action: 'release',
        is_active: true,
        module_id: 14,
      },
      // BI Payment / Template (module_id=15)
      { id: 51, code: 'bp_template_view', name: 'Xem', method: 'GET', action: 'read', is_active: true, module_id: 15 },
      {
        id: 52,
        code: 'bp_template_create',
        name: 'Tạo mới',
        method: 'POST',
        action: 'create',
        is_active: true,
        module_id: 15,
      },
      {
        id: 53,
        code: 'bp_template_delete',
        name: 'Xóa',
        method: 'DELETE',
        action: 'delete',
        is_active: true,
        module_id: 15,
      },
      {
        id: 54,
        code: 'bp_template_duplicate',
        name: 'Nhân bản',
        method: 'POST',
        action: 'duplicate',
        is_active: true,
        module_id: 15,
      },
      // BI Payment / Document (module_id=16) — per type: preparing, reconciliation, feedback
      {
        id: 55,
        code: 'bp_doc_preparing_view',
        name: 'Xem preparing',
        method: 'GET',
        action: 'preparing_read',
        is_active: true,
        module_id: 16,
      },
      {
        id: 56,
        code: 'bp_doc_preparing_upload',
        name: 'Upload preparing',
        method: 'POST',
        action: 'preparing_upload',
        is_active: true,
        module_id: 16,
      },
      {
        id: 57,
        code: 'bp_doc_preparing_download',
        name: 'Download preparing',
        method: 'GET',
        action: 'preparing_download',
        is_active: true,
        module_id: 16,
      },
      {
        id: 58,
        code: 'bp_doc_reconcil_view',
        name: 'Xem reconciliation',
        method: 'GET',
        action: 'reconciliation_read',
        is_active: true,
        module_id: 16,
      },
      {
        id: 59,
        code: 'bp_doc_reconcil_upload',
        name: 'Upload reconciliation',
        method: 'POST',
        action: 'reconciliation_upload',
        is_active: true,
        module_id: 16,
      },
      {
        id: 60,
        code: 'bp_doc_reconcil_download',
        name: 'Download reconciliation',
        method: 'GET',
        action: 'reconciliation_download',
        is_active: true,
        module_id: 16,
      },
      {
        id: 61,
        code: 'bp_doc_feedback_view',
        name: 'Xem feedback',
        method: 'GET',
        action: 'feedback_read',
        is_active: true,
        module_id: 16,
      },
      {
        id: 62,
        code: 'bp_doc_feedback_upload',
        name: 'Upload feedback',
        method: 'POST',
        action: 'feedback_upload',
        is_active: true,
        module_id: 16,
      },
      {
        id: 63,
        code: 'bp_doc_feedback_download',
        name: 'Download feedback',
        method: 'GET',
        action: 'feedback_download',
        is_active: true,
        module_id: 16,
      },
      // BI Payment / Checklist (module_id=17)
      { id: 64, code: 'bp_checklist_view', name: 'Xem', method: 'GET', action: 'read', is_active: true, module_id: 17 },
      {
        id: 65,
        code: 'bp_checklist_create',
        name: 'Tạo mới',
        method: 'POST',
        action: 'create',
        is_active: true,
        module_id: 17,
      },
      {
        id: 66,
        code: 'bp_checklist_edit',
        name: 'Sửa',
        method: 'PUT',
        action: 'update',
        is_active: true,
        module_id: 17,
      },
      {
        id: 67,
        code: 'bp_checklist_delete',
        name: 'Xóa',
        method: 'DELETE',
        action: 'delete',
        is_active: true,
        module_id: 17,
      },
      {
        id: 68,
        code: 'bp_checklist_approve',
        name: 'Duyệt',
        method: 'PATCH',
        action: 'approve',
        is_active: true,
        module_id: 17,
      },
      // BI Payment / Other File (module_id=18)
      {
        id: 69,
        code: 'bp_other_file_view',
        name: 'Xem',
        method: 'GET',
        action: 'read',
        is_active: true,
        module_id: 18,
      },
      {
        id: 70,
        code: 'bp_other_file_upload',
        name: 'Upload',
        method: 'POST',
        action: 'upload',
        is_active: true,
        module_id: 18,
      },
      {
        id: 71,
        code: 'bp_other_file_download',
        name: 'Download',
        method: 'GET',
        action: 'download',
        is_active: true,
        module_id: 18,
      },
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
