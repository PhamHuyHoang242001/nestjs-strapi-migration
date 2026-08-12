/* eslint-disable no-console */
// Idempotent demo-data seeder for the Prompt Library workspace. Populates prompt_packages and
// prompt_versions with a large, all-statuses dataset so the three screens (PublishedList,
// ReviewQueue, PromptDetail) render richly for demo/review.
//
// Not a migration on purpose: demo data must NOT ride the schema-migration chain into prod.
// Re-runnable: wipes ONLY the prompt_* tables, then re-inserts. It also brings the schema to
// head idempotently (creates prompt_packages/prompt_versions + indexes) so it is safe to run
// before the formal migration is applied.
//
// The artifact is inline text (prompt_versions.prompt_content) — NO ZIP, NO files table.
//
// Run:  npx ts-node -r tsconfig-paths/register src/scripts/seed-prompt-library-demo-data.ts

import { DataSource, EntityManager } from 'typeorm';
import { DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_NAME } from '@configuration/env.config';

// Test accounts seeded by seed-prompt-test-users.ts. Resolved by username at runtime so the
// script stays correct even if ids differ per environment.
const UPLOADER_USERNAME = 'prompt_uploader';
const APPROVER_USERNAME = 'prompt_approver';

type Category = 'writing' | 'coding' | 'marketing' | 'analysis' | 'roleplay' | 'data' | 'other';
type VersionState = 'approved' | 'pending' | 'rejected';

interface VersionSpec {
  versionNo: number;
  state: VersionState;
  changelogNote?: string; // required on a bump (v2+)
  rejectReason?: string; // only for rejected
  bodyExtra?: string; // extra prompt body so v2 diffs against v1
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

// ---- prompt_content generator --------------------------------------------------
// Deterministic, human-readable prompt text so DiffView / PromptDetail render real content.
function promptText(p: PackageSpec, v: VersionSpec): string {
  const base = `# ${p.name}

## Vai trò
Bạn là một trợ lý AI chuyên về "${p.shortDescription}".

## Bối cảnh
Danh mục: ${p.category}
Thẻ: ${p.tags.join(', ')}

## Hướng dẫn
1. Đọc kỹ yêu cầu và dữ liệu đầu vào của người dùng.
2. Phân tích và thực hiện tác vụ theo đúng phạm vi được mô tả.
3. Trả lời bằng tiếng Việt, rõ ràng, có cấu trúc.

## Biến đầu vào
- {input}: nội dung người dùng cung cấp.
- {options}: tuỳ chọn bổ sung (không bắt buộc).

## Định dạng đầu ra
Trả về kết quả súc tích kèm giải thích ngắn gọn khi cần.`;
  return v.bodyExtra ? `${base}\n\n## Thay đổi ở phiên bản này\n${v.bodyExtra}\n` : base;
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
  // writing
  pub('tom-tat-van-ban', 'Trợ lý Tóm tắt Văn bản', 'writing', 'Tóm tắt văn bản dài thành bản ngắn gọn mạch lạc.', ['tóm tắt', 'văn bản'], 40),
  pub('soan-email', 'Soạn Email Chuyên nghiệp', 'writing', 'Soạn email công việc theo văn phong lịch sự, rõ ràng.', ['email', 'soạn thảo'], 38),
  pub('viet-blog', 'Trợ lý Viết Blog', 'writing', 'Lên dàn ý và viết bài blog chuẩn SEO.', ['blog', 'seo', 'content'], 36),
  pub('bien-tap-noi-dung', 'Biên tập & Rà soát Nội dung', 'writing', 'Rà soát ngữ pháp, giọng văn và tính nhất quán.', ['biên tập', 'proofread'], 34),
  // coding
  pub('review-code', 'Trợ lý Review Code', 'coding', 'Rà soát code tìm bug, code smell và đề xuất cải thiện.', ['code-review', 'refactor'], 32),
  pub('sinh-unit-test', 'Sinh Unit Test', 'coding', 'Sinh unit test bao phủ các nhánh và edge case.', ['test', 'jest'], 30),
  pub('giai-thich-code', 'Giải thích Code', 'coding', 'Giải thích đoạn code phức tạp theo từng bước.', ['explain', 'docs'], 28),
  pub('viet-sql', 'Trợ lý Viết SQL', 'coding', 'Chuyển yêu cầu ngôn ngữ tự nhiên thành truy vấn SQL.', ['sql', 'query'], 26),
  // marketing
  pub('viet-quang-cao', 'Viết Nội dung Quảng cáo', 'marketing', 'Viết headline và mô tả quảng cáo có tính chuyển đổi.', ['ads', 'copywriting'], 24),
  pub('ke-hoach-social', 'Kế hoạch Nội dung Mạng xã hội', 'marketing', 'Lên lịch và ý tưởng nội dung mạng xã hội theo tuần.', ['social', 'content-plan'], 22),
  pub('mo-ta-san-pham', 'Mô tả Sản phẩm', 'marketing', 'Viết mô tả sản phẩm hấp dẫn, nhấn mạnh lợi ích.', ['ecommerce', 'product'], 20),
  pub('kich-ban-video', 'Kịch bản Video Ngắn', 'marketing', 'Viết kịch bản video ngắn thu hút cho quảng bá.', ['video', 'script'], 18),
  // analysis
  pub('phan-tich-swot', 'Phân tích SWOT', 'analysis', 'Lập bảng SWOT cho doanh nghiệp hoặc sản phẩm.', ['swot', 'strategy'], 16),
  pub('phan-tich-canh-tranh', 'Phân tích Đối thủ Cạnh tranh', 'analysis', 'So sánh đối thủ theo tiêu chí và đề xuất khác biệt hoá.', ['competitor', 'market'], 14),
  pub('tom-tat-nghien-cuu', 'Tóm tắt Báo cáo Nghiên cứu', 'analysis', 'Rút gọn báo cáo dài thành các phát hiện chính.', ['research', 'insight'], 12),
  pub('phan-tich-phan-hoi', 'Phân tích Phản hồi Khách hàng', 'analysis', 'Phân loại và tổng hợp cảm xúc từ phản hồi khách hàng.', ['sentiment', 'feedback'], 10),
  // roleplay
  pub('phong-van-thu', 'Người Phỏng vấn Thử', 'roleplay', 'Đóng vai nhà tuyển dụng phỏng vấn thử theo vị trí.', ['interview', 'hr'], 9),
  pub('luyen-tieng-anh', 'Bạn luyện Tiếng Anh', 'roleplay', 'Đóng vai bạn hội thoại luyện nói tiếng Anh.', ['english', 'conversation'], 8),
  pub('tu-van-vien', 'Tư vấn viên Bán hàng', 'roleplay', 'Đóng vai tư vấn viên xử lý tình huống bán hàng.', ['sales', 'roleplay'], 7),
  pub('gia-su-toan', 'Gia sư Toán', 'roleplay', 'Đóng vai gia sư giảng giải bài toán theo cấp độ.', ['tutor', 'math'], 6),
  // data
  pub('lam-sach-du-lieu', 'Trợ lý Làm sạch Dữ liệu', 'data', 'Hướng dẫn làm sạch và chuẩn hoá tập dữ liệu.', ['data-cleaning', 'etl'], 5),
  pub('giai-thich-bang', 'Giải thích Bảng Dữ liệu', 'data', 'Diễn giải xu hướng từ bảng số liệu đầu vào.', ['tabular', 'insight'], 4),
  pub('sinh-du-lieu-mau', 'Sinh Dữ liệu Mẫu', 'data', 'Sinh dữ liệu mẫu hợp lệ theo schema mô tả.', ['mock-data', 'schema'], 3),
  pub('phan-loai-du-lieu', 'Phân loại Dữ liệu', 'data', 'Gán nhãn và phân loại bản ghi theo tiêu chí.', ['classification', 'labeling'], 2),
];

// ---- multi-version history builder ---------------------------------------------
// Deterministic changelog / reject-reason pools (no RNG — picked by slug+version).
const CHANGELOG_POOL = [
  'Bổ sung ví dụ few-shot để tăng độ ổn định.',
  'Tinh chỉnh giọng văn cho phù hợp ngữ cảnh ngân hàng.',
  'Thêm ràng buộc định dạng đầu ra rõ ràng hơn.',
  'Sửa lỗi diễn đạt gây hiểu nhầm ở phần hướng dẫn.',
  'Rút gọn prompt, giảm token mà vẫn giữ chất lượng.',
  'Bổ sung xử lý trường hợp đầu vào rỗng.',
  'Nâng cấp phần vai trò để trả lời chuyên sâu hơn.',
  'Thêm cảnh báo an toàn và giới hạn phạm vi.',
];
const REJECT_POOL = [
  'Prompt còn mơ hồ ở phần định dạng đầu ra; cần cụ thể hơn.',
  'Chưa xử lý trường hợp đầu vào rỗng; bổ sung hướng dẫn.',
  'Giọng văn chưa phù hợp chuẩn nội bộ; cần chỉnh lại.',
  'Thiếu ràng buộc an toàn cho nội dung nhạy cảm.',
];

// Version-history archetypes (index 0 = v1 oldest … last = newest). Every archetype starts with
// an approved v1 so the package always has base content + an active version.
const HISTORY_ARCHETYPES: VersionState[][] = [
  ['approved', 'approved', 'approved'],
  ['approved', 'approved', 'approved', 'pending'],
  ['approved', 'rejected', 'approved', 'rejected', 'approved'],
  ['approved', 'approved'],
  ['approved', 'approved', 'approved', 'approved'],
  ['approved', 'approved', 'rejected'],
  ['approved', 'approved', 'approved', 'rejected', 'approved'],
];

function buildHistory(base: PackageSpec, states: VersionState[], newestDaysAgo: number): PackageSpec {
  const seed = base.slug.length;
  const GAP_DAYS = 25;
  const n = states.length;
  const versions: VersionSpec[] = states.map((state, i) => {
    const versionNo = i + 1;
    const daysAgo = newestDaysAgo + (n - 1 - i) * GAP_DAYS;
    if (versionNo === 1) return { versionNo, state, daysAgo }; // v1: no changelog (initial release)
    const note = CHANGELOG_POOL[(seed + versionNo) % CHANGELOG_POOL.length];
    const spec: VersionSpec = { versionNo, state, daysAgo, changelogNote: note, bodyExtra: `- ${note}` };
    if (state === 'rejected') spec.rejectReason = REJECT_POOL[(seed + versionNo) % REJECT_POOL.length];
    return spec;
  });
  let activeVersionNo: number | null = null;
  for (const v of versions) if (v.state === 'approved') activeVersionNo = v.versionNo;
  return { ...base, versions, activeVersionNo };
}

function applyHistories(list: PackageSpec[]): PackageSpec[] {
  return list.map((p, i) => buildHistory(p, HISTORY_ARCHETYPES[i % HISTORY_ARCHETYPES.length], p.versions[0].daysAgo));
}

// Pending-only (first upload awaiting review; no active version yet).
const PENDING_ONLY: PackageSpec[] = [
  { slug: 'chatbot-cskh', name: 'Prompt Chatbot CSKH', category: 'roleplay', shortDescription: 'Đóng vai trợ lý CSKH trả lời câu hỏi thường gặp.', tags: ['chatbot', 'cskh'], status: 'active', activeVersionNo: null, versions: [{ versionNo: 1, state: 'pending', daysAgo: 2 }] },
  { slug: 'tao-tieu-de', name: 'Prompt Tạo Tiêu đề', category: 'marketing', shortDescription: 'Sinh nhiều phương án tiêu đề hấp dẫn.', tags: ['headline', 'copywriting'], status: 'active', activeVersionNo: null, versions: [{ versionNo: 1, state: 'pending', daysAgo: 1 }] },
  { slug: 'refactor-goi-y', name: 'Prompt Gợi ý Refactor', category: 'coding', shortDescription: 'Đề xuất refactor đoạn code theo nguyên tắc SOLID.', tags: ['refactor', 'solid'], status: 'active', activeVersionNo: null, versions: [{ versionNo: 1, state: 'pending', daysAgo: 1 }] },
];

// Rejected-only (first upload rejected; no active version). Visible only in detail timeline.
const REJECTED_ONLY: PackageSpec[] = [
  { slug: 'noi-dung-nhay-cam', name: 'Prompt Nội dung Nhạy cảm', category: 'other', shortDescription: 'Sinh nội dung chưa qua kiểm duyệt an toàn.', tags: ['unsafe'], status: 'active', activeVersionNo: null, versions: [{ versionNo: 1, state: 'rejected', daysAgo: 6, rejectReason: 'Thiếu ràng buộc an toàn; cần bổ sung guardrail.' }] },
  { slug: 'spam-email', name: 'Prompt Email Hàng loạt', category: 'marketing', shortDescription: 'Sinh email marketing gửi hàng loạt.', tags: ['spam', 'email'], status: 'active', activeVersionNo: null, versions: [{ versionNo: 1, state: 'rejected', daysAgo: 5, rejectReason: 'Thiếu cơ chế opt-out và tuân thủ quy định gửi thư.' }] },
];

// Inactive (approved active version but hidden from public list). Deepened to a 3-version approved
// history so the detail timeline is rich even for retired prompts.
const INACTIVE: PackageSpec[] = [
  pub('prompt-cu-bao-cao', 'Prompt Cũ - Báo cáo', 'analysis', 'Prompt tạo báo cáo phiên bản cũ (đã ngừng dùng).', ['legacy'], 60),
  pub('prompt-cu-dich', 'Prompt Cũ - Dịch thuật', 'writing', 'Prompt dịch thuật cũ, đã thay bằng bản mới.', ['deprecated', 'translate'], 55),
].map((p) => ({ ...buildHistory(p, ['approved', 'approved', 'approved'], p.versions[0].daysAgo), status: 'inactive' as const }));

function allPackages(): PackageSpec[] {
  return [...applyHistories(PUBLISHED), ...PENDING_ONLY, ...REJECTED_ONLY, ...INACTIVE];
}

// ---- schema-to-head (idempotent) -----------------------------------------------
// Creates prompt_packages / prompt_versions + indexes if absent. Mirrors the formal migration
// CreatePromptLibraryTables so the seeder is safe to run before migrations are applied.
async function ensureSchema(m: EntityManager): Promise<void> {
  await m.query(`
    CREATE TABLE IF NOT EXISTS prompt_packages (
      id                SERIAL PRIMARY KEY,
      created_at        TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
      deleted_at        TIMESTAMP WITHOUT TIME ZONE,
      is_deleted        BOOLEAN DEFAULT FALSE,
      active_version_id INT,
      status            VARCHAR NOT NULL DEFAULT 'active',
      created_by        INT NOT NULL
    )
  `);
  await m.query(`
    CREATE TABLE IF NOT EXISTS prompt_versions (
      id                SERIAL PRIMARY KEY,
      created_at        TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
      deleted_at        TIMESTAMP WITHOUT TIME ZONE,
      is_deleted        BOOLEAN DEFAULT FALSE,
      prompt_package_id INT NOT NULL,
      version_no        INT NOT NULL,
      state             VARCHAR NOT NULL DEFAULT 'pending',
      name              VARCHAR NOT NULL,
      short_description TEXT NOT NULL,
      category          VARCHAR NOT NULL,
      tags              JSONB NOT NULL DEFAULT '[]',
      avatar_url        VARCHAR,
      prompt_content    TEXT NOT NULL,
      changelog_note    TEXT,
      submitted_by      INT NOT NULL,
      reviewed_by       INT,
      reviewed_at       TIMESTAMP WITHOUT TIME ZONE,
      reject_reason     TEXT,
      CONSTRAINT fk_prompt_versions_package
        FOREIGN KEY (prompt_package_id) REFERENCES prompt_packages (id) ON DELETE RESTRICT
    )
  `);
  // Circular FK — add only if missing (CREATE TABLE IF NOT EXISTS won't re-add it on re-run).
  await m.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_prompt_packages_active_version') THEN
        ALTER TABLE prompt_packages
          ADD CONSTRAINT fk_prompt_packages_active_version
          FOREIGN KEY (active_version_id) REFERENCES prompt_versions (id) ON DELETE SET NULL;
      END IF;
    END $$;
  `);
  await m.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uidx_prompt_versions_one_pending_per_package
    ON prompt_versions (prompt_package_id) WHERE state = 'pending' AND is_deleted = false
  `);
  await m.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uidx_prompt_versions_package_version_no
    ON prompt_versions (prompt_package_id, version_no)
  `);
}

// ---- helpers -------------------------------------------------------------------
const avatarUrl = (slug: string) => `https://api.dicebear.com/7.x/icons/svg?seed=${encodeURIComponent(slug)}&backgroundType=gradientLinear`;

async function seed(m: EntityManager, uploaderId: number, approverId: number): Promise<void> {
  const pkgs = allPackages();
  let vCount = 0;
  for (const p of pkgs) {
    const pkgRows = (await m.query(
      `INSERT INTO prompt_packages (status, created_by, is_deleted, created_at, updated_at)
       VALUES ($1, $2, false, NOW(), NOW()) RETURNING id`,
      [p.status, uploaderId],
    )) as Array<{ id: number }>;
    const packageId = Number(pkgRows[0].id);

    let activeVersionId: number | null = null;
    for (const v of p.versions) {
      const isReviewed = v.state === 'approved' || v.state === 'rejected';
      const verRows = (await m.query(
        `INSERT INTO prompt_versions
           (prompt_package_id, version_no, state, name, short_description, category, tags,
            prompt_content, changelog_note, submitted_by, reviewed_by, reviewed_at, reject_reason,
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
          p.category,
          JSON.stringify(p.tags),
          promptText(p, v),
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
          `UPDATE prompt_versions SET reviewed_at = created_at + interval '2 hours' WHERE id = $1`,
          [versionId],
        );
      }

      if (p.activeVersionNo !== null && v.versionNo === p.activeVersionNo) {
        activeVersionId = versionId;
      }
    }

    if (activeVersionId !== null) {
      await m.query(`UPDATE prompt_packages SET active_version_id = $1 WHERE id = $2`, [activeVersionId, packageId]);
    }
  }

  console.log(`  ✓ ${pkgs.length} packages, ${vCount} versions inserted`);
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

      // Resolve test users by username (seeded by seed-prompt-test-users.ts).
      const users = (await m.query(
        `SELECT id, username FROM users WHERE username IN ($1, $2)`,
        [UPLOADER_USERNAME, APPROVER_USERNAME],
      )) as Array<{ id: number; username: string }>;
      const byName: Record<string, number> = {};
      for (const u of users) byName[u.username] = Number(u.id);
      for (const name of [UPLOADER_USERNAME, APPROVER_USERNAME]) {
        if (!byName[name]) throw new Error(`User '${name}' not found — run seed-prompt-test-users.ts first.`);
      }

      // Idempotent wipe: clear circular FK first, then children → parents. prompt_* only.
      await m.query(`UPDATE prompt_packages SET active_version_id = NULL`);
      await m.query(`DELETE FROM prompt_versions`);
      await m.query(`DELETE FROM prompt_packages`);

      await seed(m, byName[UPLOADER_USERNAME], byName[APPROVER_USERNAME]);
    });

    console.log('\nDone. Prompt-library demo data seeded. Reload the /asset-hub/prompt screen.');
  } finally {
    await ds.destroy();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
