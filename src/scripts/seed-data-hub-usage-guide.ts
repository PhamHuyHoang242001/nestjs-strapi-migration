/* eslint-disable @typescript-eslint/no-unsafe-assignment */
// Builds the "Hướng dẫn sử dụng" (usage_guide_html) of a mock data service, following the mock's API / SFTP
// guide templates filled with the service's own values.

import { EntityManager } from 'typeorm';

type Row = Record<string, any>;
type Block =
  | { h: 3 | 4; text: string }
  | { p: string }
  | { list: string[] }
  | { table: { head: string[]; rows: string[][] } }
  | { hr: true };

const GUIDE_LINK = 'https://confluence.vpbank.com.vn/display/EDA/Data+Exchange+Integration+Guidelines';
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Inline markup used in the blocks: **bold**, `code`, [text](url).
const inlineHtml = (s: string) =>
  esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[(.+?)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
function toHtml(blocks: Block[]): string {
  return blocks
    .map((b) => {
      if ('h' in b) return `<h${b.h}>${inlineHtml(b.text)}</h${b.h}>`;
      if ('p' in b) return `<p>${inlineHtml(b.p)}</p>`;
      if ('list' in b) return `<ul>${b.list.map((i) => `<li>${inlineHtml(i)}</li>`).join('')}</ul>`;
      if ('hr' in b) return '<hr>';
      const { head, rows } = b.table;
      const th = head.map((h) => `<th>${inlineHtml(h)}</th>`).join('');
      const tr = rows.map((r) => `<tr>${r.map((c) => `<td>${inlineHtml(c)}</td>`).join('')}</tr>`).join('');
      return `<table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`;
    })
    .join('\n');
}

const errorSection = (n: number, title: string): Block[] => [
  { h: 3, text: `${n}. Quy chuẩn mã lỗi & tài liệu tham chiếu` },
  { list: [`**Tra cứu danh mục mã lỗi chuẩn:** xem [${title}](${GUIDE_LINK})`] },
];

function apiGuide(s: Row): Block[] {
  const params: Row[] = s.parameters_detail ?? [];
  return [
    { h: 3, text: '1. Hướng dẫn kết nối & xác thực' },
    {
      list: [
        `**Endpoint:** \`${s.method} ${s.endpoint_domain}${s.endpoint_path}\``,
        `**Cơ chế xác thực:** Bearer Token (OAuth 2.0) qua APIC Gateway`,
        '**Header bắt buộc:** `Authorization: Bearer <access_token>`, `X-Client-ID: <client_id>`, `X-Request-ID: <uuid_v4>`',
        `**SLA:** ${s.sla ?? '—'} · **Độ trễ tham chiếu:** ${s.latency ?? '—'} · **Tần suất cập nhật:** ${s.frequency ?? '—'}`,
      ],
    },
    { hr: true },
    { h: 3, text: '2. Đặc tả tham số kỹ thuật (API contract)' },
    { h: 4, text: '2.1 Tham số đầu vào' },
    {
      table: {
        head: ['Tham số', 'Phạm vi', 'Bắt buộc', 'Mô tả', 'Ví dụ'],
        rows: params.map((p) => [
          `\`${p.name}\``,
          String(p.type ?? 'query'),
          p.required ? '✓' : '✕',
          String(p.desc ?? ''),
          String(p.example ?? ''),
        ]),
      },
    },
    { h: 4, text: '2.2 Tham số đầu ra' },
    {
      table: {
        head: ['Tham số', 'Kiểu dữ liệu', 'Bắt buộc', 'Mô tả'],
        rows: [
          ['`code`', 'String(10)', '✓', 'Mã kết quả (`200` = thành công)'],
          ['`message`', 'String(255)', '✓', 'Thông điệp phản hồi'],
          ['`data`', 'Object / Array', '✓', 'Dữ liệu trả về theo các tham số đầu vào'],
        ],
      },
    },
    { hr: true },
    { h: 3, text: '3. Quy tắc xử lý nghiệp vụ' },
    {
      list: [
        `**Mục đích sử dụng:** ${s.use_case_description ?? '—'}`,
        `**Nguồn dữ liệu:** \`${s.source_tables_metadata ?? '—'}\` (${s.data_freshness ?? '—'})`,
        '**Phân trang:** truyền `page` / `limit`; mặc định trả 20 bản ghi mỗi trang.',
      ],
    },
    { hr: true },
    ...errorSection(4, 'Danh mục mã lỗi & hướng dẫn tích hợp APIC Gateway'),
    {
      list: [
        '`200 OK`: thành công',
        '`400`: tham số sai định dạng hoặc thiếu',
        '`401 / 403`: lỗi xác thực / không có quyền',
        '`500`: lỗi hệ thống nguồn',
      ],
    },
  ];
}

function sftpGuide(s: Row): Block[] {
  const terms: Row[] = s.mapped_terms ?? [];
  return [
    { h: 3, text: '1. Cấu trúc file & tham số kỹ thuật' },
    {
      table: {
        head: ['Tên cột', 'Kiểu dữ liệu', 'Thuật ngữ chuẩn hóa', 'Mô tả'],
        rows: terms.map((t) => [
          `\`${t.physical_column}\``,
          String(t.data_type ?? ''),
          `\`${t.term_code}\``,
          String(t.logical_term ?? ''),
        ]),
      },
    },
    { hr: true },
    { h: 3, text: '2. Quy tắc xử lý & truyền nhận file' },
    {
      list: [
        `**Máy chủ:** \`${s.endpoint_domain}\` · **Thư mục:** \`${s.endpoint_path}\` · **Chiều truyền:** ${s.flowDirection ?? '—'}`,
        `**Tên file:** \`${s.sftp_file_pattern ?? '—'}\` · **Định dạng:** ${s.fileFormat ?? '—'}`,
        `**Lịch trích xuất:** ${s.sftp_frequency ?? '—'} (sau EOD)`,
        '**Mã hóa & toàn vẹn:** mã hóa PGP, kèm file checksum `.sha256`.',
        `**Nguồn dữ liệu:** \`${s.source_tables_metadata ?? '—'}\``,
      ],
    },
    { hr: true },
    ...errorSection(3, 'Danh mục mã lỗi & quy chuẩn truyền nhận SFTP Gateway'),
    {
      list: [
        'File sai định dạng / lệch checksum: hệ thống cảnh báo và hỗ trợ xuất lại.',
        'File được lưu 30 ngày trên SFTP trước khi archive.',
      ],
    },
  ];
}

export function buildUsageGuide(s: Row): string {
  return toHtml(s.service_type === 'API' ? apiGuide(s) : sftpGuide(s));
}

// Fills the guide of already-imported mock services that were seeded with an empty guide.
export async function backfillUsageGuides(m: EntityManager, services: Row[]): Promise<number> {
  let updated = 0;
  for (const s of services) {
    const rows: Row[] = await m.query(
      `UPDATE data_hub_data_service_versions SET usage_guide_html = $1, updated_at = NOW()
       WHERE changelog_note = $2 AND usage_guide_html = '' RETURNING id`,
      [buildUsageGuide(s), `mock-import:${s.id}`],
    );
    updated += Array.isArray(rows[0]) ? rows[0].length : rows.length;
  }
  return updated;
}
