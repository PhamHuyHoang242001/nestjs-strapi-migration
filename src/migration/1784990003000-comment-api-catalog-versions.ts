import { MigrationInterface, QueryRunner } from 'typeorm';

const VERSION_COMMENTS: Array<[string, string]> = [
  ['api_catalog_package_id', 'FK tới api_catalog_packages. Một version luôn thuộc đúng một gói.'],
  ['version_no', 'Số phiên bản đã chốt. Pending dùng placeholder; lúc duyệt = (old_version ?? 0) + 1.'],
  ['old_version', 'version_no đang active lúc submit bump. NULL = version đầu (mới).'],
  ['state', 'pending | approved | rejected.'],
  ['name', 'Tên API hiển thị trên catalog.'],
  ['short_description', 'Mô tả ngắn trên list/card.'],
  ['category_id', 'Danh mục api-catalog đang active.'],
  [
    'usage_guide_html',
    'Hướng dẫn dùng (HTML). Gồm tham số, mã lỗi, sequence diagram. Create bắt buộc có nội dung.',
  ],
  ['avatar_url', 'URL ảnh trên Strapi. BE chỉ lưu URL, không tải file.'],
  ['http_method', 'GET | POST | PUT | DELETE.'],
  ['endpoint_path', 'Path đầy đủ, ví dụ /v1/ai/nlp/sentiment.'],
  ['input_format', 'body | query | upload_file. Quyết định shape mock_req.'],
  ['call_mode', 'sync | async. Quyết định key bắt buộc trên mock_req / mock_res.'],
  ['sync_timeout', 'Nhãn timeout request đồng bộ. Bắt buộc khi call_mode = sync; null khi async.'],
  ['sla', 'Nhãn SLA hiển thị, ví dụ 99.9%. Không parse.'],
  ['tps', 'Nhãn TPS hiển thị. Không parse.'],
  ['latency_p95', 'Nhãn latency P95 hiển thị. Không parse.'],
  ['throughput', 'Nhãn throughput hiển thị. Không parse.'],
  ['max_payload', 'Nhãn kích thước payload tối đa. Không parse.'],
  ['rate_limit', 'Nhãn rate limit hiển thị. Không parse.'],
  ['encryption', 'Nhãn mã hóa / auth hiển thị. Không parse.'],
  [
    'mock_req',
    'JSONB duy nhất cho request input, key sync và/hoặc async. body/query: object. upload_file: { fields, files[] } — mỗi file bắt buộc url.',
  ],
  [
    'mock_res',
    'JSONB sample response playground. Cùng key mode với mock_req; mỗi value phải là object.',
  ],
  ['changelog_note', 'Ghi chú thay đổi khi bump version. Version đầu để null.'],
  ['submitted_by', 'User id người submit version.'],
  ['reviewed_by', 'User id người duyệt/từ chối. Null khi còn pending.'],
  ['reviewed_at', 'Thời điểm duyệt/từ chối.'],
  ['reject_reason', 'Lý do từ chối. Null nếu không bị reject.'],
];

export class CommentApiCatalogVersions1784990003000 implements MigrationInterface {
  name = 'CommentApiCatalogVersions1784990003000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      COMMENT ON TABLE api_catalog_versions IS
      'Một bản spec của gói API Catalog. Request input nằm ở mock_req; docs (mã lỗi, sequence) nằm ở usage_guide_html.'
    `);
    for (const [column, comment] of VERSION_COMMENTS) {
      await queryRunner.query(`COMMENT ON COLUMN api_catalog_versions.${column} IS '${comment.replace(/'/g, "''")}'`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('COMMENT ON TABLE api_catalog_versions IS NULL');
    for (const [column] of VERSION_COMMENTS) {
      await queryRunner.query(`COMMENT ON COLUMN api_catalog_versions.${column} IS NULL`);
    }
  }
}
