/* eslint-disable no-console */
// Idempotent demo-data seeder for the Skill Package workspace. Populates skill_packages,
// skill_versions and skill_version_files with a large, all-statuses dataset so the three
// screens (PublishedList, ReviewQueue, SkillDetail) render richly for demo/review.
//
// Not a migration on purpose: demo data must NOT ride the schema-migration chain into prod.
// Re-runnable: wipes ONLY the skill_* tables, then re-inserts. It also brings the schema to
// head idempotently (creates skill_version_files, drops the stale zip_url column) because the
// entities/queries already expect the final shape and the list query joins skill_version_files.
//
// Run:  npx ts-node -r tsconfig-paths/register src/scripts/seed-skill-package-demo-data.ts

import { DataSource, EntityManager } from 'typeorm';
import { DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_NAME } from '@configuration/env.config';

// Test accounts seeded by seed-skill-test-users.ts. Resolved by username at runtime so the
// script stays correct even if ids differ per environment.
const UPLOADER_USERNAME = 'skill_uploader';
const APPROVER_USERNAME = 'skill_approver';

type Category = 'general' | 'data-analysis' | 'automation' | 'integration' | 'reporting' | 'other';
type VersionState = 'approved' | 'pending' | 'rejected';

interface VersionSpec {
  versionNo: number;
  state: VersionState;
  changelogNote?: string; // required on a bump (v2+)
  rejectReason?: string; // only for rejected
  mdExtra?: string; // extra skill.md body so v2 diffs against v1
  daysAgo: number; // created_at = now - daysAgo (spreads the list ordering)
}

interface PackageSpec {
  slug: string;
  name: string;
  category: Category;
  shortDescription: string;
  tags: string[];
  status: 'active' | 'inactive';
  activeVersionNo: number | null; // version_no that becomes active_version (approved); null if none
  versions: VersionSpec[];
}

// ---- skill.md generator --------------------------------------------------------
// Deterministic, human-readable markdown so DiffView / SkillDetail render real content.
function skillMd(p: PackageSpec, v: VersionSpec): string {
  const base = `# ${p.name}

## Mô tả
${p.shortDescription}

## Danh mục
\`${p.category}\`

## Thẻ
${p.tags.map((t) => `- ${t}`).join('\n')}

## Cách dùng
1. Cấu hình tham số đầu vào trong panel bên trái.
2. Chạy skill và chờ kết quả trả về.
3. Xuất kết quả ra định dạng mong muốn (CSV / JSON / PDF).

## Đầu vào
| Tham số | Kiểu | Bắt buộc |
|---------|------|----------|
| source  | string | Có |
| options | object | Không |

## Đầu ra
Trả về đối tượng kết quả kèm metadata thời gian xử lý.
`;
  return v.mdExtra ? `${base}\n## Thay đổi ở phiên bản này\n${v.mdExtra}\n` : base;
}

// ---- dataset builders ----------------------------------------------------------

// Standard single-version published package: v1 approved & active.
function pub(slug: string, name: string, category: Category, shortDescription: string, tags: string[], daysAgo: number): PackageSpec {
  return {
    slug,
    name,
    category,
    shortDescription,
    tags,
    status: 'active',
    activeVersionNo: 1,
    versions: [{ versionNo: 1, state: 'approved', daysAgo }],
  };
}

const PUBLISHED: PackageSpec[] = [
  // general
  pub('tong-hop-van-ban', 'Trợ lý Tổng hợp Văn bản', 'general', 'Tổng hợp và chuẩn hóa nội dung văn bản dài thành bản tóm tắt mạch lạc.', ['nlp', 'tóm tắt', 'văn bản'], 40),
  pub('tom-tat-cuoc-hop', 'Tóm tắt Cuộc họp', 'general', 'Trích xuất quyết định và việc cần làm từ biên bản họp.', ['họp', 'tóm tắt', 'action-items'], 38),
  pub('tro-ly-email', 'Trợ lý Email Nội bộ', 'general', 'Soạn và rà soát email nội bộ theo văn phong ngân hàng.', ['email', 'soạn thảo'], 36),
  pub('chuan-hoa-danh-muc', 'Chuẩn hóa Dữ liệu Danh mục', 'general', 'Làm sạch và chuẩn hóa danh mục mã ngành, mã sản phẩm.', ['data-cleaning', 'danh mục'], 34),
  // data-analysis
  pub('phan-tich-giao-dich-the', 'Phân tích Giao dịch Thẻ', 'data-analysis', 'Phân tích hành vi chi tiêu thẻ tín dụng theo nhóm khách hàng.', ['thẻ', 'phân tích', 'chi tiêu'], 32),
  pub('du-bao-dong-tien', 'Dự báo Dòng tiền', 'data-analysis', 'Mô hình dự báo dòng tiền vào/ra theo chuỗi thời gian.', ['forecast', 'dòng tiền', 'time-series'], 30),
  pub('phat-hien-bat-thuong', 'Phát hiện Bất thường Giao dịch', 'data-analysis', 'Cảnh báo giao dịch bất thường bằng phát hiện điểm dị biệt.', ['anomaly', 'fraud', 'cảnh báo'], 28),
  pub('phan-khuc-khach-hang', 'Phân khúc Khách hàng', 'data-analysis', 'Phân cụm khách hàng theo hành vi và giá trị vòng đời.', ['segmentation', 'clustering'], 26),
  // automation
  pub('doi-soat-cuoi-ngay', 'Tự động Đối soát Cuối ngày', 'automation', 'Đối soát giao dịch cuối ngày giữa core và cổng thanh toán.', ['đối soát', 'batch', 'eod'], 24),
  pub('gui-bao-cao-dinh-ky', 'Tự động Gửi Báo cáo Định kỳ', 'automation', 'Lên lịch tổng hợp và gửi báo cáo định kỳ qua email.', ['scheduler', 'báo cáo'], 22),
  pub('nhac-lich-thanh-toan', 'Bot Nhắc lịch Thanh toán', 'automation', 'Nhắc khách hàng lịch thanh toán khoản vay tự động.', ['reminder', 'khoản vay'], 20),
  pub('phan-loai-ticket', 'Tự động Phân loại Ticket', 'automation', 'Phân loại và định tuyến ticket hỗ trợ theo chủ đề.', ['ticket', 'routing', 'nlp'], 18),
  // integration
  pub('ket-noi-core-banking', 'Kết nối Core Banking', 'integration', 'Cầu nối dữ liệu tài khoản và giao dịch từ core banking.', ['core', 'api', 'sync'], 16),
  pub('dong-bo-crm', 'Đồng bộ CRM Salesforce', 'integration', 'Đồng bộ hai chiều dữ liệu khách hàng với Salesforce.', ['crm', 'salesforce', 'sync'], 14),
  pub('tich-hop-vietqr', 'Tích hợp Cổng VietQR', 'integration', 'Sinh mã VietQR và nhận webhook trạng thái thanh toán.', ['vietqr', 'payment', 'webhook'], 12),
  pub('webhook-giao-dich', 'Webhook Sự kiện Giao dịch', 'integration', 'Phát sự kiện giao dịch realtime tới hệ thống hạ nguồn.', ['webhook', 'event', 'realtime'], 10),
  // reporting
  pub('bao-cao-tin-dung', 'Báo cáo Tín dụng Hàng tháng', 'reporting', 'Tổng hợp dư nợ, nhóm nợ và trích lập dự phòng hàng tháng.', ['tín dụng', 'báo cáo', 'monthly'], 9),
  pub('dashboard-chi-nhanh', 'Dashboard Hiệu suất Chi nhánh', 'reporting', 'Bảng điều khiển KPI huy động, tín dụng theo chi nhánh.', ['dashboard', 'kpi', 'chi nhánh'], 8),
  pub('bao-cao-aml', 'Báo cáo Tuân thủ AML', 'reporting', 'Tổng hợp giao dịch đáng ngờ phục vụ báo cáo AML.', ['aml', 'compliance', 'sar'], 7),
  pub('bao-cao-nim-casa', 'Báo cáo NIM & CASA', 'reporting', 'Theo dõi biên lãi ròng và tỉ lệ CASA theo kỳ.', ['nim', 'casa', 'finance'], 6),
  // other
  pub('trich-xuat-pdf', 'Trích xuất Bảng từ PDF', 'other', 'Bóc tách bảng biểu từ tài liệu PDF sang dữ liệu có cấu trúc.', ['pdf', 'ocr', 'table'], 5),
  pub('speech-to-text', 'Chuyển đổi Giọng nói thành Văn bản', 'other', 'Chuyển audio cuộc gọi CSKH sang văn bản tiếng Việt.', ['asr', 'speech', 'tiếng việt'], 4),
  pub('kiem-tra-chinh-ta', 'Kiểm tra Chính tả Tiếng Việt', 'other', 'Rà soát và gợi ý sửa lỗi chính tả tài liệu tiếng Việt.', ['spellcheck', 'tiếng việt'], 3),
  pub('anh-marketing', 'Tạo Ảnh Minh họa Marketing', 'other', 'Sinh ảnh minh họa cho ấn phẩm marketing nội bộ.', ['image-gen', 'marketing'], 2),
];

// ---- multi-version history builder ---------------------------------------------
// Deterministic changelog / reject-reason pools (no RNG — picked by slug+version). Give the
// version-history timeline real, varied notes so SkillDetail renders a rich history per skill.
const CHANGELOG_POOL = [
  'Bổ sung bộ lọc theo khoảng thời gian.',
  'Cải thiện hiệu năng xử lý theo lô.',
  'Thêm hỗ trợ xuất kết quả định dạng JSON.',
  'Sửa lỗi xử lý ký tự tiếng Việt có dấu.',
  'Tối ưu truy vấn, giảm thời gian phản hồi.',
  'Bổ sung kiểm thử và tài liệu hướng dẫn.',
  'Nâng cấp mô hình, tăng độ chính xác.',
  'Thêm cảnh báo ngưỡng và cấu hình linh hoạt.',
];
const REJECT_POOL = [
  'Thiếu tài liệu đánh giá độ chính xác; vui lòng bổ sung benchmark.',
  'Chưa xử lý trường hợp dữ liệu rỗng; cần bổ sung kiểm tra đầu vào.',
  'Chưa tuân thủ quy ước đặt tên tham số; cần chỉnh theo chuẩn nội bộ.',
  'Thiếu cơ chế xử lý lỗi khi gọi dịch vụ ngoài.',
];

// Version-history archetypes (index 0 = v1 oldest … last = newest). Every archetype starts with
// an approved v1 so the package always has base content + an active version. The active version is
// the highest-numbered approved entry; a trailing 'pending' therefore stays in the review queue
// while an earlier approved version remains active.
const HISTORY_ARCHETYPES: VersionState[][] = [
  ['approved', 'approved', 'approved'], // stable v3
  ['approved', 'approved', 'approved', 'pending'], // mature, newest awaiting review
  ['approved', 'rejected', 'approved', 'rejected', 'approved'], // rocky evolution, active v5
  ['approved', 'approved'], // still growing, active v2
  ['approved', 'approved', 'approved', 'approved'], // long-lived, active v4
  ['approved', 'approved', 'rejected'], // newest bump rejected, active stays v2
  ['approved', 'approved', 'approved', 'rejected', 'approved'], // recovered after a reject, active v5
];

// Expand a single-version base spec into a full multi-version history following `states`.
// created_at spreads newest→oldest (higher version_no = more recent). `newestDaysAgo` anchors the
// newest version's age (reuses the base's original daysAgo slot).
function buildHistory(base: PackageSpec, states: VersionState[], newestDaysAgo: number): PackageSpec {
  const seed = base.slug.length;
  const GAP_DAYS = 25;
  const n = states.length;
  const versions: VersionSpec[] = states.map((state, i) => {
    const versionNo = i + 1;
    const daysAgo = newestDaysAgo + (n - 1 - i) * GAP_DAYS;
    if (versionNo === 1) return { versionNo, state, daysAgo }; // v1: no changelog (initial release)
    const note = CHANGELOG_POOL[(seed + versionNo) % CHANGELOG_POOL.length];
    const spec: VersionSpec = { versionNo, state, daysAgo, changelogNote: note, mdExtra: `- ${note}` };
    if (state === 'rejected') spec.rejectReason = REJECT_POOL[(seed + versionNo) % REJECT_POOL.length];
    return spec;
  });
  let activeVersionNo: number | null = null;
  for (const v of versions) if (v.state === 'approved') activeVersionNo = v.versionNo;
  return { ...base, versions, activeVersionNo };
}

// Assign a history archetype to each published package (cycled by position → deterministic + varied).
function applyHistories(list: PackageSpec[]): PackageSpec[] {
  return list.map((p, i) => buildHistory(p, HISTORY_ARCHETYPES[i % HISTORY_ARCHETYPES.length], p.versions[0].daysAgo));
}

// Pending-only (first upload awaiting review; no active version yet).
const PENDING_ONLY: PackageSpec[] = [
  { slug: 'chatbot-cskh', name: 'Trợ lý Chatbot CSKH', category: 'general', shortDescription: 'Chatbot trả lời câu hỏi thường gặp của khách hàng 24/7.', tags: ['chatbot', 'cskh'], status: 'active', activeVersionNo: null, versions: [{ versionNo: 1, state: 'pending', daysAgo: 2 }] },
  { slug: 'rui-ro-tin-dung', name: 'Phân tích Rủi ro Tín dụng', category: 'data-analysis', shortDescription: 'Chấm điểm rủi ro tín dụng dựa trên hồ sơ khách hàng.', tags: ['credit-risk', 'scoring'], status: 'active', activeVersionNo: null, versions: [{ versionNo: 1, state: 'pending', daysAgo: 1 }] },
  { slug: 'backup-cau-hinh', name: 'Tự động Backup Cấu hình', category: 'automation', shortDescription: 'Sao lưu định kỳ cấu hình hệ thống lên kho lưu trữ.', tags: ['backup', 'devops'], status: 'active', activeVersionNo: null, versions: [{ versionNo: 1, state: 'pending', daysAgo: 1 }] },
];

// Rejected-only (first upload rejected; no active version). Visible only in detail timeline.
const REJECTED_ONLY: PackageSpec[] = [
  { slug: 'cao-du-lieu-web', name: 'Cào Dữ liệu Web', category: 'other', shortDescription: 'Thu thập dữ liệu từ các trang web công khai.', tags: ['scraping', 'crawler'], status: 'active', activeVersionNo: null, versions: [{ versionNo: 1, state: 'rejected', daysAgo: 6, rejectReason: 'Vi phạm chính sách sử dụng dữ liệu; cần xác nhận nguồn hợp lệ.' }] },
  { slug: 'gui-sms-hang-loat', name: 'Gửi SMS Hàng loạt', category: 'automation', shortDescription: 'Gửi tin nhắn SMS marketing tới danh sách khách hàng.', tags: ['sms', 'marketing'], status: 'active', activeVersionNo: null, versions: [{ versionNo: 1, state: 'rejected', daysAgo: 5, rejectReason: 'Thiếu cơ chế opt-out và tài liệu tuân thủ bảo mật dữ liệu.' }] },
];

// Inactive (approved active version but hidden from public list). Deepened to a 3-version approved
// history so the detail timeline is rich even for retired skills.
const INACTIVE: PackageSpec[] = [
  pub('xuat-excel-cu', 'Công cụ Cũ - Xuất Excel', 'reporting', 'Công cụ xuất báo cáo Excel phiên bản cũ (đã ngừng hỗ trợ).', ['excel', 'legacy'], 60),
  pub('api-ty-gia-deprecated', 'API Tỷ giá (Deprecated)', 'integration', 'API tra cứu tỷ giá cũ, đã thay thế bằng dịch vụ mới.', ['fx', 'deprecated'], 55),
].map((p) => ({ ...buildHistory(p, ['approved', 'approved', 'approved'], p.versions[0].daysAgo), status: 'inactive' as const }));

function allPackages(): PackageSpec[] {
  return [...applyHistories(PUBLISHED), ...PENDING_ONLY, ...REJECTED_ONLY, ...INACTIVE];
}

// ---- schema-to-head (idempotent) -----------------------------------------------
async function ensureSchema(m: EntityManager): Promise<void> {
  await m.query(`
    CREATE TABLE IF NOT EXISTS skill_version_files (
      id               SERIAL PRIMARY KEY,
      created_at       TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
      deleted_at       TIMESTAMP WITHOUT TIME ZONE,
      is_deleted       BOOLEAN DEFAULT FALSE,
      skill_version_id INT NOT NULL,
      file_kind        VARCHAR NOT NULL,
      file_url         VARCHAR NOT NULL,
      name             VARCHAR,
      size             INT,
      mime_type        VARCHAR,
      CONSTRAINT fk_skill_version_files_version
        FOREIGN KEY (skill_version_id) REFERENCES skill_versions (id) ON DELETE CASCADE
    )
  `);
  await m.query(`CREATE INDEX IF NOT EXISTS idx_skill_version_files_version ON skill_version_files (skill_version_id)`);
  // Drop the stale inline zip column so the schema matches the current entity (files own the zip).
  await m.query(`ALTER TABLE skill_versions DROP COLUMN IF EXISTS zip_url`);
  await m.query(`
    CREATE TABLE IF NOT EXISTS ai_hub_categories (
      id SERIAL PRIMARY KEY, name VARCHAR(200) NOT NULL, type VARCHAR(20) NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TIMESTAMP WITHOUT TIME ZONE,
      is_deleted BOOLEAN DEFAULT FALSE
    )
  `);
  await m.query(`ALTER TABLE skill_versions ADD COLUMN IF NOT EXISTS category_id INT NULL`);
  await m.query(`ALTER TABLE skill_versions DROP COLUMN IF EXISTS category`);
}

async function resolveCategoryId(m: EntityManager, name: string, type: 'skill' | 'prompt'): Promise<number> {
  const existing = (await m.query(
    `SELECT id FROM ai_hub_categories
     WHERE type = $1 AND LOWER(BTRIM(name)) = LOWER(BTRIM($2)) AND COALESCE(is_deleted, false) = false
     ORDER BY id ASC LIMIT 1`,
    [type, name],
  )) as Array<{ id: number }>;
  if (existing[0]) return Number(existing[0].id);
  const inserted = (await m.query(
    `INSERT INTO ai_hub_categories (name, type, is_active, is_deleted)
     VALUES ($1, $2, true, false) RETURNING id`,
    [name, type],
  )) as Array<{ id: number }>;
  return Number(inserted[0].id);
}

// ---- helpers -------------------------------------------------------------------
const STRAPI_HOST = process.env.STRAPI_UPLOAD_URL ?? 'http://localhost:1337';
const avatarUrl = (slug: string) => `https://api.dicebear.com/7.x/icons/svg?seed=${encodeURIComponent(slug)}&backgroundType=gradientLinear`;
const zipUrl = (slug: string, v: number) => `${STRAPI_HOST}/uploads/${slug}_v${v}.zip`;
// Deterministic pseudo-size (no Math.random — 200KB..~1.2MB range) derived from the slug.
const zipSize = (slug: string, v: number) => 200_000 + ((slug.length * 37 + v * 9973) % 1_000_000);

async function seed(m: EntityManager, uploaderId: number, approverId: number): Promise<void> {
  const pkgs = allPackages();
  let vCount = 0;
  for (const p of pkgs) {
    const pkgRows = (await m.query(
      `INSERT INTO skill_packages (status, created_by, is_deleted, created_at, updated_at)
       VALUES ($1, $2, false, NOW(), NOW()) RETURNING id`,
      [p.status, uploaderId],
    )) as Array<{ id: number }>;
    const packageId = Number(pkgRows[0].id);

    let activeVersionId: number | null = null;
    for (const v of p.versions) {
      const isReviewed = v.state === 'approved' || v.state === 'rejected';
      const categoryId = await resolveCategoryId(m, p.category, 'skill');
      const verRows = (await m.query(
        `INSERT INTO skill_versions
           (skill_package_id, version_no, state, name, short_description, category_id, tags,
            skill_md_content, changelog_note, submitted_by, reviewed_by, reviewed_at, reject_reason,
            avatar_url, is_deleted, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,$14,false,
                 NOW() - ($15 || ' days')::interval, NOW() - ($15 || ' days')::interval)
         RETURNING id`,
        [
          packageId,
          v.versionNo,
          v.state,
          p.name,
          p.shortDescription,
          categoryId,
          JSON.stringify(p.tags),
          skillMd(p, v),
          v.changelogNote ?? null,
          uploaderId,
          isReviewed ? approverId : null,
          null, // reviewed_at stamped below via SQL for reviewed states (needs created_at)
          v.rejectReason ?? null,
          avatarUrl(p.slug),
          String(v.daysAgo),
        ],
      )) as Array<{ id: number }>;
      const versionId = Number(verRows[0].id);
      vCount++;

      // reviewed_at: stamp a plausible review time (a bit after submission) for reviewed states.
      if (isReviewed) {
        await m.query(
          `UPDATE skill_versions SET reviewed_at = created_at + interval '2 hours' WHERE id = $1`,
          [versionId],
        );
      }

      // One zip file row per version (skill_version_files owns the archive).
      await m.query(
        `INSERT INTO skill_version_files
           (skill_version_id, file_kind, file_url, name, size, mime_type, is_deleted, created_at, updated_at)
         VALUES ($1, 'zip', $2, $3, $4, 'application/zip', false, NOW(), NOW())`,
        [versionId, zipUrl(p.slug, v.versionNo), `${p.slug}-v${v.versionNo}.zip`, zipSize(p.slug, v.versionNo)],
      );

      if (p.activeVersionNo !== null && v.versionNo === p.activeVersionNo) {
        activeVersionId = versionId;
      }
    }

    if (activeVersionId !== null) {
      await m.query(`UPDATE skill_packages SET active_version_id = $1 WHERE id = $2`, [activeVersionId, packageId]);
    }
  }

  console.log(`  ✓ ${pkgs.length} packages, ${vCount} versions (+ zip files) inserted`);
  const published = pkgs.filter((p) => p.status === 'active' && p.activeVersionNo !== null).length;
  const pending = pkgs.reduce((n, p) => n + p.versions.filter((v) => v.state === 'pending').length, 0);
  const rejected = pkgs.reduce((n, p) => n + p.versions.filter((v) => v.state === 'rejected').length, 0);
  const inactive = pkgs.filter((p) => p.status === 'inactive').length;
  console.log(`    published(list)=${published}  pending(reviews)=${pending}  rejected=${rejected}  inactive=${inactive}`);
}

async function main(): Promise<void> {
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

  try {
    await ds.transaction(async (m) => {
      await ensureSchema(m);

      // Resolve test users by username (seeded by seed-skill-test-users.ts).
      const users = (await m.query(
        `SELECT id, username FROM users WHERE username IN ($1, $2)`,
        [UPLOADER_USERNAME, APPROVER_USERNAME],
      )) as Array<{ id: number; username: string }>;
      const byName: Record<string, number> = {};
      for (const u of users) byName[u.username] = Number(u.id);
      for (const name of [UPLOADER_USERNAME, APPROVER_USERNAME]) {
        if (!byName[name]) throw new Error(`User '${name}' not found — run seed-skill-test-users.ts first.`);
      }

      // Idempotent wipe: clear circular FK first, then children → parents. skill_* only.
      await m.query(`UPDATE skill_packages SET active_version_id = NULL`);
      await m.query(`DELETE FROM skill_version_files`);
      await m.query(`DELETE FROM skill_versions`);
      await m.query(`DELETE FROM skill_packages`);

      await seed(m, byName[UPLOADER_USERNAME], byName[APPROVER_USERNAME]);
    });

    console.log('\nDone. Skill-package demo data seeded. Reload the /asset-hub/skill screen.');
  } finally {
    await ds.destroy();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
