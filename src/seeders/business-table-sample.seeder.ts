// Seed sample records into all ALLOWED_TABLES so the data-access
// "records browser" has data for testing the add-rule feature.

import { Injectable } from '@nestjs/common';
import { Seeder } from 'nestjs-seeder';
import { DataSource } from 'typeorm';

@Injectable()
export class BusinessTableSampleSeeder implements Seeder {
  constructor(private connection: DataSource) {}

  async seed(): Promise<any> {
    await this.seedWorkspaces();
    await this.seedTemplates();
    await this.seedDocuments();
    await this.seedBiccDepartments();
    await this.seedHubReports();
    await this.seedDiagnosticCategories();
    await this.seedDiagnosticReports();
    await this.seedPaymentProjects();
    await this.seedPaymentPrograms();
    await this.seedPaymentWorkSteps();
    await this.seedPaymentChecklists();
    await this.seedPaymentOtherFiles();
  }

  // ── MA Tool Workspaces ─────────────────────────────────────────────
  private async seedWorkspaces() {
    if (await this.hasData('ma_tool_workspaces')) return;
    await this.connection.query(`
      INSERT INTO ma_tool_workspaces (id, name, fullname, description, workspace_status) VALUES
      (1, 'WS-Finance',     'Finance Workspace',         'Financial reports workspace',    'active'),
      (2, 'WS-HR',          'Human Resources Workspace',  'HR data management workspace', 'active'),
      (3, 'WS-Operations',  'Operations Workspace',       'Operations data workspace',    'active'),
      (4, 'WS-Marketing',   'Marketing Workspace',        'Marketing analytics workspace','draft'),
      (5, 'WS-IT',          'IT Infrastructure Workspace', 'IT monitoring workspace',     'active')
    `);
    await this.resetSeq('ma_tool_workspaces');
  }

  // ── MA Tool Templates ──────────────────────────────────────────────
  private async seedTemplates() {
    if (await this.hasData('ma_tool_templates')) return;
    await this.connection.query(`
      INSERT INTO ma_tool_templates (id, name, description, template_status, upload_method, template_type, workspace_id) VALUES
      (1, 'Báo cáo thu chi hàng tháng',   'Template thu chi theo tháng',    'active', 'override', 'ma-tool',     1),
      (2, 'Bảng lương nhân viên',          'Template bảng lương hàng tháng', 'active', 'override', 'ma-tool',     2),
      (3, 'KPI vận hành',                  'Template KPI hàng quý',          'active', 'append',   'ma-tool',     3),
      (4, 'Template thanh toán',           'Template thanh toán định kỳ',    'active', 'override', 'bi-payment',  1),
      (5, 'Báo cáo marketing',             'Template chiến dịch marketing', 'draft',  'append',   'ma-tool',     4),
      (6, 'Báo cáo chi phí IT',            'Template chi phí IT hàng quý',  'active', 'override', 'ma-tool',     5),
      (7, 'Template đối soát',             'Template đối soát dữ liệu',     'active', 'scd2',     'bi-payment',  1),
      (8, 'Báo cáo tồn kho',              'Template tồn kho cuối kỳ',      'active', 'override', 'ma-tool',     3)
    `);
    await this.resetSeq('ma_tool_templates');
  }

  // ── MA Tool Documents ──────────────────────────────────────────────
  private async seedDocuments() {
    if (await this.hasData('ma_tool_documents')) return;
    await this.connection.query(`
      INSERT INTO ma_tool_documents (id, document_code, document_name, document_date, document_status, document_type, template_id) VALUES
      (1, 'DOC-FIN-001', 'Thu chi T01/2026',         '2026-01-31', 'approved',  'report',   1),
      (2, 'DOC-FIN-002', 'Thu chi T02/2026',         '2026-02-28', 'approved',  'report',   1),
      (3, 'DOC-HR-001',  'Bảng lương T01/2026',      '2026-01-31', 'approved',  'payroll',  2),
      (4, 'DOC-HR-002',  'Bảng lương T02/2026',      '2026-02-28', 'pending',   'payroll',  2),
      (5, 'DOC-OPS-001', 'KPI Q1/2026',              '2026-03-31', 'approved',  'kpi',      3),
      (6, 'DOC-PAY-001', 'Thanh toán T03/2026',      '2026-03-31', 'approved',  'payment',  4),
      (7, 'DOC-MKT-001', 'Chiến dịch Tết 2026',     '2026-01-15', 'draft',     'campaign', 5),
      (8, 'DOC-IT-001',  'Chi phí IT Q1/2026',       '2026-03-31', 'approved',  'expense',  6)
    `);
    await this.resetSeq('ma_tool_documents');
  }

  // ── BI Hub BICC Departments ─────────────────────────────────────────
  private async seedBiccDepartments() {
    if (await this.hasData('bi_hub_bicc_departments')) return;
    await this.connection.query(`
      INSERT INTO bi_hub_bicc_departments (id, name, code) VALUES
      (1, 'BICC Tài chính',   'BICC-FIN'),
      (2, 'BICC Nhân sự',     'BICC-HR'),
      (3, 'BICC Vận hành',    'BICC-OPS'),
      (4, 'BICC Marketing',   'BICC-MKT'),
      (5, 'BICC IT',          'BICC-IT')
    `);
    await this.resetSeq('bi_hub_bicc_departments');
  }

  // ── BI Hub Reports ─────────────────────────────────────────────────
  private async seedHubReports() {
    if (await this.hasData('bi_hub_reports')) return;
    await this.connection.query(`
      INSERT INTO bi_hub_reports (id, name, requester, order_date, sending_date, due_date, report_type, progress_status, report_status, description, bicc_department_id) VALUES
      (1, 'Doanh thu theo BU Q1/2026',         'Nguyễn Văn A', '2026-01-05', '2026-01-10', '2026-01-15', 'regular', 'completed',  'ongoing', 'Báo cáo doanh thu theo BU quý 1',    1),
      (2, 'Chi phí vận hành T01/2026',          'Trần Thị B',   '2026-01-10', '2026-01-15', '2026-01-20', 'regular', 'completed',  'ongoing', 'Chi phí vận hành tháng 1',           3),
      (3, 'Phân tích thị trường 2026',          'Lê Văn C',     '2026-02-01', '2026-02-10', '2026-02-15', 'adhoc',   'inprogress', 'ongoing', 'Phân tích xu hướng thị trường',      4),
      (4, 'Báo cáo KPI nhân sự Q1/2026',       'Phạm Thị D',   '2026-03-01', '2026-03-10', '2026-03-15', 'regular', 'completed',  'ongoing', 'KPI nhân sự quý 1',                 2),
      (5, 'Báo cáo tài chính năm 2025',        'Nguyễn Văn A', '2026-01-15', '2026-01-25', '2026-01-31', 'adhoc',   'completed',  'closed',  'Tổng kết tài chính 2025',            1),
      (6, 'Doanh thu theo sản phẩm T03/2026',  'Trần Thị B',   '2026-03-05', '2026-03-10', '2026-03-15', 'regular', 'inprogress', 'ongoing', 'Doanh thu chi tiết theo sản phẩm',   1),
      (7, 'Báo cáo chi phí marketing Q1/2026', 'Lê Văn C',     '2026-03-10', '2026-03-15', '2026-03-20', 'regular', 'overdue',    'ongoing', 'Chi phí marketing quý 1',            4),
      (8, 'Phân tích lợi nhuận BU Thép',       'Phạm Thị D',   '2026-04-01', '2026-04-05', '2026-04-10', 'adhoc',   'inprogress', 'ongoing', 'Lợi nhuận chi tiết BU Thép',        3)
    `);
    await this.resetSeq('bi_hub_reports');
  }

  // ── BI Diagnostic Categories ───────────────────────────────────────
  private async seedDiagnosticCategories() {
    if (await this.hasData('bi_diagnostic_categories')) return;
    await this.connection.query(`
      INSERT INTO bi_diagnostic_categories (id, name, code, bicc_department_id) VALUES
      (1, 'Tài chính',  'FIN', 1),
      (2, 'Nhân sự',    'HR',  2),
      (3, 'Vận hành',   'OPS', 3),
      (4, 'IT',         'IT',  5),
      (5, 'Marketing',  'MKT', 4)
    `);
    await this.resetSeq('bi_diagnostic_categories');
  }

  // ── BI Diagnostic Reports ──────────────────────────────────────────
  private async seedDiagnosticReports() {
    if (await this.hasData('bi_diagnostic_reports')) return;
    await this.connection.query(`
      INSERT INTO bi_diagnostic_reports (id, name, code, bu_name, summary, bi_diagnostic_category_id) VALUES
      (1, 'Chẩn đoán dòng tiền Q1/2026',       'DIAG-FIN-001', 'BU Thép',        'Phân tích dòng tiền quý 1',          1),
      (2, 'Chẩn đoán hiệu suất nhân viên',      'DIAG-HR-001',  'BU Bất động sản','Đánh giá hiệu suất toàn công ty',    2),
      (3, 'Chẩn đoán quy trình sản xuất',       'DIAG-OPS-001', 'BU Thép',        'Phân tích bottleneck sản xuất',      3),
      (4, 'Chẩn đoán hạ tầng IT',               'DIAG-IT-001',  'IT Center',      'Đánh giá hạ tầng server và network', 4),
      (5, 'Chẩn đoán hiệu quả chiến dịch MKT', 'DIAG-MKT-001', 'BU Điện máy',    'ROI các chiến dịch marketing',       5),
      (6, 'Chẩn đoán chi phí logistics',        'DIAG-OPS-002', 'BU Thép',        'Chi phí vận chuyển và kho bãi',      3)
    `);
    await this.resetSeq('bi_diagnostic_reports');
  }

  // ── BI Payment Projects ────────────────────────────────────────────
  private async seedPaymentProjects() {
    if (await this.hasData('bi_payment_projects')) return;
    await this.connection.query(`
      INSERT INTO bi_payment_projects (id, project_code, project_name, description, project_type, project_status, requester, requester_unit) VALUES
      (1, 'PRJ-001', 'Dự án thanh toán BU Thép',        'Thanh toán hàng tháng BU Thép',      'regular', 'active',   'Nguyễn Văn A', 'BU Thép'),
      (2, 'PRJ-002', 'Dự án thanh toán BU BĐS',         'Thanh toán BU Bất động sản',         'regular', 'active',   'Trần Thị B',   'BU BĐS'),
      (3, 'PRJ-003', 'Dự án thanh toán đặc biệt Q1',    'Thanh toán đặc biệt quý 1/2026',    'adhoc',   'active',   'Lê Văn C',     'Kế toán'),
      (4, 'PRJ-004', 'Dự án thanh toán BU Điện máy',    'Thanh toán BU Điện máy',             'regular', 'active',   'Phạm Thị D',   'BU Điện máy'),
      (5, 'PRJ-005', 'Dự án thanh toán IT',              'Thanh toán dịch vụ IT',              'regular', 'inactive', 'Nguyễn Văn A', 'IT Center')
    `);
    await this.resetSeq('bi_payment_projects');
  }

  // ── BI Payment Programs ────────────────────────────────────────────
  private async seedPaymentPrograms() {
    if (await this.hasData('bi_payment_programs')) return;
    await this.connection.query(`
      INSERT INTO bi_payment_programs (id, name, code, description, program_type, program_status, progress_status, workstep_current, project_id) VALUES
      (1, 'Chương trình TT tháng 1',  'PGM-001', 'Thanh toán tháng 1/2026',  'regular', 'active',   'completed',  'release',             1),
      (2, 'Chương trình TT tháng 2',  'PGM-002', 'Thanh toán tháng 2/2026',  'regular', 'active',   'completed',  'release',             1),
      (3, 'Chương trình TT tháng 3',  'PGM-003', 'Thanh toán tháng 3/2026',  'regular', 'active',   'inprogress', 'calculating',         1),
      (4, 'TT BĐS Q1',               'PGM-004', 'Thanh toán BĐS quý 1',     'regular', 'active',   'inprogress', 'preparing',           2),
      (5, 'TT đặc biệt thưởng Tết',  'PGM-005', 'Thanh toán thưởng Tết',    'adhoc',   'active',   'completed',  'release',             3),
      (6, 'TT Điện máy T03',          'PGM-006', 'Thanh toán Điện máy T3',   'regular', 'active',   'inprogress', 'reconciliation',      4),
      (7, 'TT dịch vụ cloud',         'PGM-007', 'Thanh toán cloud services','regular', 'inactive', 'notstarted', 'create_a_program',    5)
    `);
    await this.resetSeq('bi_payment_programs');
  }

  // ── BI Payment Work Steps ──────────────────────────────────────────
  private async seedPaymentWorkSteps() {
    if (await this.hasData('bi_payment_work_steps')) return;
    await this.connection.query(`
      INSERT INTO bi_payment_work_steps (id, step_order, step_name, step_status, description, program_id) VALUES
      (1, 1, 'Tạo chương trình',    'completed', 'Khởi tạo chương trình thanh toán',  3),
      (2, 2, 'Chuẩn bị dữ liệu',   'completed', 'Upload và kiểm tra dữ liệu đầu vào',3),
      (3, 3, 'Tính toán',           'inprogress','Đang tính toán thanh toán',          3),
      (4, 1, 'Tạo chương trình',    'completed', 'Khởi tạo chương trình',             4),
      (5, 2, 'Chuẩn bị dữ liệu',   'inprogress','Đang chuẩn bị dữ liệu',            4),
      (6, 1, 'Tạo chương trình',    'completed', 'Khởi tạo chương trình đối soát',    6),
      (7, 2, 'Chuẩn bị dữ liệu',   'completed', 'Dữ liệu đã sẵn sàng',              6),
      (8, 3, 'Tính toán',           'completed', 'Đã tính xong',                      6),
      (9, 4, 'Đối soát',            'inprogress','Đang đối soát dữ liệu',             6)
    `);
    await this.resetSeq('bi_payment_work_steps');
  }

  // ── BI Payment Checklists ──────────────────────────────────────────
  private async seedPaymentChecklists() {
    if (await this.hasData('bi_payment_checklists')) return;
    await this.connection.query(`
      INSERT INTO bi_payment_checklists (id, name, type, checklist_status, program_id) VALUES
      (1, 'Checklist nhập liệu T03',    'data_input', 'active', 3),
      (2, 'Checklist file khác T03',     'other',      'active', 3),
      (3, 'Checklist nhập liệu BĐS',    'data_input', 'active', 4),
      (4, 'Checklist tổng hợp Điện máy', 'all',        'active', 6),
      (5, 'Checklist thưởng Tết',        'data_input', 'active', 5)
    `);
    await this.resetSeq('bi_payment_checklists');
  }

  // ── BI Payment Other Files ─────────────────────────────────────────
  private async seedPaymentOtherFiles() {
    if (await this.hasData('bi_payment_other_files')) return;
    await this.connection.query(`
      INSERT INTO bi_payment_other_files (id, name, type, file_url, bi_payment_checklist_id) VALUES
      (1, 'Bảng kê thanh toán T03.xlsx',  'xlsx', '/files/payment-t03.xlsx',      1),
      (2, 'Biên bản đối soát T03.pdf',    'pdf',  '/files/reconciliation-t03.pdf', 1),
      (3, 'Danh sách nhân viên BĐS.xlsx', 'xlsx', '/files/staff-bds.xlsx',        3),
      (4, 'Hợp đồng cloud Q1.pdf',        'pdf',  '/files/cloud-contract-q1.pdf', 2),
      (5, 'Bảng tổng hợp Điện máy.xlsx',  'xlsx', '/files/summary-dm.xlsx',       4)
    `);
    await this.resetSeq('bi_payment_other_files');
  }

  // ── Helpers ────────────────────────────────────────────────────────

  private async hasData(table: string): Promise<boolean> {
    const [{ count }] = await this.connection.query(
      `SELECT count(*)::int AS count FROM ${table} WHERE deleted_at IS NULL`,
    );
    return count > 0;
  }

  private async resetSeq(table: string): Promise<void> {
    await this.connection.query(
      `SELECT setval('${table}_id_seq', (SELECT COALESCE(MAX(id), 1) FROM ${table}))`,
    );
  }

  async drop(): Promise<any> {
    const tables = [
      'bi_payment_other_files',
      'bi_payment_checklists',
      'bi_payment_work_steps',
      'bi_payment_programs',
      'bi_payment_projects',
      'bi_diagnostic_reports',
      'bi_diagnostic_categories',
      'bi_hub_reports',
      'bi_hub_bicc_departments',
      'ma_tool_documents',
      'ma_tool_templates',
      'ma_tool_workspaces',
    ];
    for (const t of tables) {
      await this.connection.query(`DELETE FROM ${t} WHERE id <= 20`);
    }
  }
}
