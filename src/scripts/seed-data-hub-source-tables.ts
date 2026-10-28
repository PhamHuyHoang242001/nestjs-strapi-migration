// Local-only seed of source tables (Bảng nguồn dịch vụ) and service-owned physical terms for the existing data
// services. Each live service gets one or two tables of its department (shared by the department's services) with a
// few terms whose codes are unique inside each table; some terms are mapped to existing logical terms. Terms are
// linked to the service's active version directly (no new version / history: this is demo data).
// Idempotent: a service that already owns terms is skipped. Refuses to run outside local development.
//
// Run: NODE_ENV=development npx ts-node -r tsconfig-paths/register src/scripts/seed-data-hub-source-tables.ts

import { DataSource, EntityManager } from 'typeorm';
import { DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_NAME } from '@configuration/env.config';

// Entity tables of a department and the columns they offer: [code, technical description, example, logical code].
const ENTITIES: Record<string, Array<[string, string, string, string | null]>> = {
  customer: [
    ['cif_no', 'Mã định danh khách hàng (CIF)', '10882394', 'cif'],
    ['legal_id', 'Số giấy tờ định danh', '001093012345', 'legal_id'],
    ['full_name', 'Họ tên khách hàng', 'NGUYEN VAN A', 'customer_name'],
    ['segment_cd', 'Phân khúc khách hàng', 'PRIORITY', 'customer_segment'],
    ['credit_score', 'Điểm tín dụng nội bộ', '712', 'credit_score'],
    ['open_date', 'Ngày mở hồ sơ', '2021-04-12', null],
  ],
  account: [
    ['acct_no', 'Số tài khoản', '0123456789', 'account_number'],
    ['casa_bal', 'Số dư CASA cuối ngày', '15000000', 'casa_balance'],
    ['od_limit', 'Hạn mức thấu chi', '50000000', 'overdraft_limit'],
    ['acct_status', 'Trạng thái tài khoản', 'ACTIVE', null],
    ['branch_cd', 'Mã chi nhánh mở tài khoản', 'HN001', null],
  ],
  transaction: [
    ['txn_id', 'Mã giao dịch', 'FT2410270001', null],
    ['txn_amt', 'Số tiền giao dịch', '2500000', 'transaction_amount'],
    ['txn_date', 'Ngày hiệu lực giao dịch', '2026-10-27', 'business_date'],
    ['channel_cd', 'Kênh phát sinh giao dịch', 'MOBILE', null],
    ['batch_ref', 'Mã tham chiếu lô đồng bộ', 'B20261027', 'batch_code_ref'],
  ],
  card: [
    ['card_no', 'Số thẻ (đã che)', '4123********1234', 'card_number'],
    ['credit_limit', 'Hạn mức thẻ tín dụng', '80000000', 'card_credit_limit'],
    ['outstanding', 'Dư nợ thẻ hiện tại', '12500000', 'card_outstanding_balance'],
    ['card_type', 'Loại thẻ', 'VISA_PLATINUM', null],
  ],
  loan: [
    ['contract_id', 'Số hợp đồng vay', 'LD2401234567', 'loan_contract_id'],
    ['principal_os', 'Dư nợ gốc', '450000000', 'loan_outstanding_principal'],
    ['npl_flag', 'Nhóm nợ xấu', 'N1', 'npl_status'],
    ['maturity_date', 'Ngày đáo hạn', '2029-06-30', null],
  ],
};
const ENTITY_NAMES = Object.keys(ENTITIES);

interface Service {
  id: number;
  service_code: string;
  active_version_id: number;
  created_by: number;
  dept_id: number;
  dept_code: string;
}

function assertLocal(): void {
  if (process.env.NODE_ENV !== 'development') throw new Error('Refusing to run: NODE_ENV must be development');
  if (!['localhost', '127.0.0.1', '::1'].includes(String(DB_HOST))) {
    throw new Error('Refusing to run: DB host is not local');
  }
}

async function tableId(m: EntityManager, name: string, deptId: number, userId: number): Promise<number> {
  const found: Array<{ id: number }> = await m.query(
    `SELECT id FROM data_hub_source_tables WHERE LOWER(name) = LOWER($1) AND deleted_at IS NULL`,
    [name],
  );
  if (found.length) return Number(found[0].id);
  const [row]: Array<{ id: number }> = await m.query(
    `INSERT INTO data_hub_source_tables (name, description, department_id, created_by)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [name, `Bảng nguồn ${name.split('.')[1]} của đơn vị ${name.split('.')[0].toUpperCase()}`, deptId, userId],
  );
  return Number(row.id);
}

async function main(): Promise<void> {
  assertLocal();
  const ds = new DataSource({
    type: 'postgres',
    host: DB_HOST,
    port: DB_PORT,
    username: DB_USERNAME,
    password: DB_PASSWORD,
    database: DB_NAME,
    entities: [],
    synchronize: false,
    logging: false,
  });
  await ds.initialize();
  const stats = { services: 0, tables: new Set<number>(), terms: 0, mapped: 0, skipped: 0 };
  try {
    await ds.transaction(async (m) => {
      const logical: Array<{ id: number; code: string }> = await m.query(
        `SELECT id, code FROM data_hub_logical_terms WHERE deleted_at IS NULL`,
      );
      const logicalId = new Map(logical.map((l) => [l.code, Number(l.id)]));
      const services: Service[] = await m.query(
        `SELECT s.id, s.service_code, s.active_version_id, s.created_by, d.id AS dept_id, d.code AS dept_code
         FROM data_hub_data_services s
         JOIN data_hub_data_service_versions v ON v.id = s.active_version_id
         JOIN data_hub_departments d ON d.id = v.department_id
         WHERE s.deleted_at IS NULL ORDER BY s.id`,
      );
      for (const s of services) {
        const owned: unknown[] = await m.query(
          'SELECT 1 FROM data_hub_physical_terms WHERE data_service_id = $1 AND deleted_at IS NULL LIMIT 1',
          [s.id],
        );
        if (owned.length) {
          stats.skipped++;
          continue;
        }
        const tableCount = 1 + (Number(s.id) % 2);
        const termIds: number[] = [];
        for (let t = 0; t < tableCount; t++) {
          const entity = ENTITY_NAMES[(Number(s.id) + t) % ENTITY_NAMES.length];
          const name = `${s.dept_code.toLowerCase()}.${entity}`;
          const stId = await tableId(m, name, Number(s.dept_id), Number(s.created_by));
          stats.tables.add(stId);
          const existing: Array<{ code: string }> = await m.query(
            'SELECT LOWER(code) AS code FROM data_hub_physical_terms WHERE source_table_id = $1 AND deleted_at IS NULL',
            [stId],
          );
          const taken = new Set(existing.map((r) => r.code));
          // Columns already owned by another service of the table get a service suffix (codes stay unique per table).
          const columns = ENTITIES[entity].slice(0, 2 + (Number(s.id) % 3));
          for (const [base, description, example, logicalCode] of columns) {
            const code = taken.has(base) ? `${base}_${s.service_code.toLowerCase().replace(/-/g, '_')}` : base;
            const mapTo = !taken.has(base) && logicalCode ? (logicalId.get(logicalCode) ?? null) : null;
            const [row]: Array<{ id: number }> = await m.query(
              `INSERT INTO data_hub_physical_terms
                 (code, technical_description, example_value, logical_term_id, source_table_id, data_service_id, created_by)
               VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
              [code, description, example, mapTo, stId, s.id, s.created_by],
            );
            taken.add(code.toLowerCase());
            termIds.push(Number(row.id));
            stats.terms++;
            if (mapTo) stats.mapped++;
          }
        }
        await m.query(
          `INSERT INTO data_hub_data_service_version_physical_terms (data_service_version_id, physical_term_id)
           SELECT $1, UNNEST($2::int[])`,
          [s.active_version_id, termIds],
        );
        stats.services++;
      }
    });
    console.log(
      `services=${stats.services} skipped=${stats.skipped} tables=${stats.tables.size} terms=${stats.terms} mapped=${stats.mapped}`,
    );
  } finally {
    await ds.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
