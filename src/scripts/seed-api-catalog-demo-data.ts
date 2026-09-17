/* eslint-disable no-console */
import { DataSource, EntityManager } from 'typeorm';
import { DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_NAME } from '@configuration/env.config';

const SAMPLE_PDF = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';

function callCols(s: { sync: boolean; async: boolean; latency_p95: string }): { call_mode: string; sync_timeout: string | null } {
  const call_mode = s.async && !s.sync ? 'async' : 'sync';
  return { call_mode, sync_timeout: s.sync ? s.latency_p95 : null };
}

type Sample = {
  name: string; format: 'body' | 'query' | 'upload_file'; method: string; path: string;
  sync: boolean; async: boolean; sla: string; tps: string; latency_p95: string;
  throughput: string; max_payload: string; rate_limit: string; encryption: string;
  definition: string;
  req: Array<{ name: string; location: string; type: string; required: string; desc: string }>;
  res: Array<{ name: string; type: string; desc: string }>;
  err: Array<{ code: string; status: string; desc: string }>;
  seq: Array<{ step: number; title: string; desc: string }>;
  mockReq: Record<string, unknown>;
  mockRes: Record<string, unknown>;
};

const samples: Sample[] = [
  {
    name: 'Customer Sentiment Analyzer', format: 'body', method: 'POST', path: '/v1/ai/nlp/sentiment',
    sync: true, async: true, sla: '99.98%', tps: '500 TPS', latency_p95: '< 35 ms',
    throughput: '15,000 RPM', max_payload: '5 MB', rate_limit: '100 req/s',
    encryption: 'mTLS + HMAC-SHA256 + AES-256',
    definition: 'Phân tích sắc thái cảm xúc Positive/Negative/Neutral từ chat, email, transcript.',
    req: [
      { name: 'customer_id', location: 'Body', type: 'String', required: 'Bắt buộc', desc: 'Mã KH VPBank' },
      { name: 'channel', location: 'Body', type: 'Enum', required: 'Bắt buộc', desc: 'CHAT_BOT | EMAIL | CALL_TRANSCRIPT' },
      { name: 'text', location: 'Body', type: 'String', required: 'Bắt buộc', desc: 'Văn bản cần phân tích' },
    ],
    res: [
      { name: 'sentiment', type: 'Enum', desc: 'POSITIVE | NEUTRAL | NEGATIVE' },
      { name: 'confidence_score', type: 'Float', desc: 'Độ tin cậy 0..1' },
    ],
    err: [
      { code: '200 OK', status: 'Success', desc: 'Phân tích thành công' },
      { code: '429', status: 'Rate Limit', desc: 'Vượt 100 req/s' },
    ],
    seq: [
      { step: 1, title: 'Send Request', desc: 'POST /v1/ai/nlp/sentiment + JWT' },
      { step: 2, title: 'Gateway', desc: 'Rate limit + HMAC' },
      { step: 3, title: 'NLP Engine', desc: 'Classifier + keywords' },
    ],
    mockReq: { sync: { customer_id: 'VPB_883921', channel: 'CHAT_BOT', text: 'Tôi rất hài lòng với tốc độ phê duyệt!' }, async: { customer_id: 'VPB_883921', channel: 'EMAIL', text: 'Khi nào có kết quả?' } },
    mockRes: { sync: { status: 'SUCCESS', code: 200, data: { sentiment: 'POSITIVE', confidence_score: 0.984, keywords: ['hài lòng'] } }, async: { job_id: 'sent-async-01', status: 'QUEUED' } },
  },
  {
    name: 'eKYC ID Card Reader', format: 'body', method: 'POST', path: '/v2/ai/vision/ekyc-ocr',
    sync: true, async: true, sla: '99.95%', tps: '300 TPS', latency_p95: '< 120 ms',
    throughput: '10,000 RPM', max_payload: '10 MB', rate_limit: '50 req/s',
    encryption: 'OAuth2 JWT + mTLS + AES-256',
    definition: 'OCR CCCD/CMND, anti-spoof, trích xuất họ tên / số giấy tờ.',
    req: [
      { name: 'document_type', location: 'Body', type: 'Enum', required: 'Bắt buộc', desc: 'ID_CARD_CHIP | PASSPORT' },
      { name: 'image_front_base64', location: 'Body', type: 'String', required: 'Bắt buộc', desc: 'Ảnh mặt trước Base64' },
    ],
    res: [
      { name: 'id_number', type: 'String', desc: 'Số CCCD (AES-256)' },
      { name: 'full_name', type: 'String', desc: 'Họ tên in hoa' },
      { name: 'is_real_document', type: 'Boolean', desc: 'Giấy tờ thật?' },
    ],
    err: [
      { code: '200 OK', status: 'Success', desc: 'OCR thành công' },
      { code: '422', status: 'Image Blur', desc: 'Ảnh mờ / cắt góc' },
    ],
    seq: [
      { step: 1, title: 'Upload ID', desc: 'POST ảnh CCCD' },
      { step: 2, title: 'Auth', desc: 'OAuth2 + mTLS' },
      { step: 3, title: 'OCR', desc: 'Transformer OCR' },
    ],
    mockReq: { sync: { document_type: 'ID_CARD_CHIP', image_front_base64: 'iVBORw0KGgoAAAANSUhEUgAA...' }, async: { document_type: 'ID_CARD_CHIP', image_front_base64: 'iVBORw0KGgoAAAANSUhEUgAA...' } },
    mockRes: { sync: { status: 'SUCCESS', data: { id_number: '001092003821', full_name: 'NGUYỄN VĂN AN', is_real_document: true } }, async: { job_id: 'ekyc-j1' } },
  },
  {
    name: 'Realtime Credit Risk Predictor', format: 'query', method: 'GET', path: '/v1/ai/risk/credit-score',
    sync: true, async: false, sla: '99.99%', tps: '800 TPS', latency_p95: '< 18 ms',
    throughput: '30,000 RPM', max_payload: '1 MB', rate_limit: '200 req/s',
    encryption: 'API Key + HMAC Signature',
    definition: 'Điểm rủi ro tín dụng realtime (XGBoost) theo CIF.',
    req: [
      { name: 'cif_number', location: 'Query', type: 'String', required: 'Bắt buộc', desc: 'Mã CIF core' },
      { name: 'loan_amount', location: 'Query', type: 'Number', required: 'Không bắt buộc', desc: 'Số tiền vay VNĐ' },
    ],
    res: [
      { name: 'credit_score', type: 'Integer', desc: '300..850' },
      { name: 'risk_grade', type: 'String', desc: 'A/B/C/D' },
      { name: 'approved_limit', type: 'Number', desc: 'Hạn mức đề xuất' },
    ],
    err: [{ code: '404', status: 'CIF Not Found', desc: 'Chưa đủ lịch sử' }],
    seq: [{ step: 1, title: 'Query', desc: 'GET ?cif_number=' }, { step: 2, title: 'Score', desc: 'XGBoost' }],
    mockReq: { sync: { cif_number: 'VPB_992182', loan_amount: 500000000 } },
    mockRes: { sync: { status: 'SUCCESS', data: { credit_score: 745, risk_grade: 'A', approved_limit: 500000000 } } },
  },
  {
    name: 'Enterprise Vector RAG Search', format: 'body', method: 'POST', path: '/v1/ai/search/vector-rag',
    sync: true, async: false, sla: '99.95%', tps: '400 TPS', latency_p95: '< 45 ms',
    throughput: '12,000 RPM', max_payload: '2 MB', rate_limit: '80 req/s',
    encryption: 'Bearer JWT + mTLS',
    definition: 'Tìm kiếm ngữ nghĩa trên Vector DB nội bộ.',
    req: [
      { name: 'query', location: 'Body', type: 'String', required: 'Bắt buộc', desc: 'Câu hỏi tiếng Việt' },
      { name: 'top_k', location: 'Body', type: 'Integer', required: 'Không bắt buộc', desc: 'Số kết quả, mặc định 5' },
    ],
    res: [{ name: 'documents', type: 'Array', desc: 'Top-K chunks + score' }],
    err: [{ code: '200 OK', status: 'Success', desc: 'Truy vấn thành công' }],
    seq: [
      { step: 1, title: 'Query', desc: 'Câu hỏi tự nhiên' },
      { step: 2, title: 'Embed', desc: 'Vector 1536-d' },
      { step: 3, title: 'Search', desc: 'Cosine trên Milvus' },
    ],
    mockReq: { sync: { query: 'Quy trình thế chấp BĐS cá nhân?', top_k: 3 } },
    mockRes: { sync: { status: 'SUCCESS', data: { documents: [{ title: 'Quy trình TSBĐ 2026', score: 0.92 }] } } },
  },
  {
    name: 'Smart Document Summarizer', format: 'body', method: 'POST', path: '/v1/ai/nlp/summarize',
    sync: true, async: true, sla: '99.98%', tps: '350 TPS', latency_p95: '< 52 ms',
    throughput: '10,000 RPM', max_payload: '8 MB', rate_limit: '60 req/s',
    encryption: 'OAuth2 JWT + mTLS',
    definition: 'Tóm tắt tờ trình, hợp đồng, biên bản họp.',
    req: [
      { name: 'document_text', location: 'Body', type: 'String', required: 'Bắt buộc', desc: 'Văn bản dài' },
      { name: 'max_summary_length', location: 'Body', type: 'Integer', required: 'Không bắt buộc', desc: 'Số từ tối đa' },
    ],
    res: [
      { name: 'summary', type: 'String', desc: 'Tóm tắt' },
      { name: 'key_points', type: 'Array', desc: 'Ý chính' },
    ],
    err: [{ code: '200 OK', status: 'Success', desc: 'Tóm tắt thành công' }],
    seq: [{ step: 1, title: 'Send doc', desc: 'POST văn bản' }, { step: 2, title: 'LLM', desc: 'Summarize' }],
    mockReq: { sync: { document_text: 'Báo cáo Q2/2026...', max_summary_length: 200 }, async: { document_text: 'Hợp đồng tín dụng...', max_summary_length: 120 } },
    mockRes: { sync: { status: 'SUCCESS', data: { summary: 'Doanh thu Q2 tăng 18%.', key_points: ['DT +18%', 'Chi phí -5%'] } }, async: { job_id: 'sum-j9' } },
  },
  {
    name: 'Statement upload', format: 'upload_file', method: 'POST', path: '/v1/docs/statements',
    sync: true, async: false, sla: '99.9%', tps: '80 TPS', latency_p95: '< 400 ms',
    throughput: '2,000 RPM', max_payload: '20 MB', rate_limit: '20 req/s',
    encryption: 'mTLS + AES-256',
    definition: 'Nhận file sao kê multipart; playground tải file mẫu PDF.',
    req: [{ name: 'file', location: 'Form', type: 'File', required: 'Bắt buộc', desc: 'PDF/CSV sao kê' }],
    res: [{ name: 'doc_id', type: 'String', desc: 'Mã tài liệu' }],
    err: [{ code: '413', status: 'Too Large', desc: 'Vượt max payload' }],
    seq: [{ step: 1, title: 'Upload file', desc: 'multipart POST' }, { step: 2, title: 'Parse', desc: 'Đọc sao kê' }],
    mockReq: { sync: { fields: { note: 'sao ke T6' }, files: [{ field: 'file', filename: 'statement-sample.pdf', mime: 'application/pdf', url: SAMPLE_PDF }] } },
    mockRes: { sync: { status: 'SUCCESS', doc_id: 'STMT_202606_001' } },
  },
];

async function main(): Promise<void> {
  const ds = new DataSource({
    type: 'postgres', host: DB_HOST, port: DB_PORT, username: DB_USERNAME, password: DB_PASSWORD,
    database: DB_NAME, entities: [], synchronize: false, logging: false,
  });
  await ds.initialize();
  try {
    await ds.transaction(async (m: EntityManager) => {
      const users = (await m.query(
        `SELECT id, username FROM users WHERE username IN ('api_uploader','api_approver')`,
      )) as Array<{ id: number; username: string }>;
      const uploader = users.find((u) => u.username === 'api_uploader');
      const approver = users.find((u) => u.username === 'api_approver');
      if (!uploader || !approver) throw new Error('Run seed-api-catalog-test-users first');
      const publisher = (await m.query(`SELECT id FROM ai_hub_publishers WHERE deleted_at IS NULL ORDER BY id LIMIT 1`)) as Array<{ id: number }>;
      let categoryId = ((await m.query(`SELECT id FROM ai_hub_categories WHERE type = 'api-catalog' AND deleted_at IS NULL ORDER BY id LIMIT 1`)) as Array<{ id: number }>)[0]?.id;
      if (!categoryId) {
        categoryId = ((await m.query(`INSERT INTO ai_hub_categories (name, type, is_active) VALUES ('API Demo', 'api-catalog', true) RETURNING id`)) as Array<{ id: number }>)[0].id;
      }
      await m.query(`DELETE FROM api_catalog_version_tags`);
      await m.query(`DELETE FROM api_catalog_package_responsibles`);
      await m.query(`UPDATE api_catalog_packages SET active_version_id = NULL`);
      await m.query(`DELETE FROM api_catalog_versions`);
      await m.query(`DELETE FROM api_catalog_packages`);

      const published: Array<{ pid: number; s: Sample; guide: string; verId: number }> = [];
      for (const s of samples) {
        const pkg = (await m.query(
          `INSERT INTO api_catalog_packages (status, created_by, publisher_id, code) VALUES ('active', $1, $2, '') RETURNING id`,
          [uploader.id, publisher[0].id],
        )) as Array<{ id: number }>;
        const pid = pkg[0].id;
        await m.query(`UPDATE api_catalog_packages SET code = $1 WHERE id = $2`, [`api_catalog_${pid}`, pid]);
        await m.query(`INSERT INTO api_catalog_package_responsibles (api_catalog_package_id, user_id) VALUES ($1, $2)`, [pid, uploader.id]);
        const reqRows = s.req.map((r) => `<tr><td>${r.name}</td><td>${r.location}</td><td>${r.type}</td><td>${r.required}</td><td>${r.desc}</td></tr>`).join('');
        const resRows = s.res.map((r) => `<tr><td>${r.name}</td><td>${r.type}</td><td>${r.desc}</td></tr>`).join('');
        const errRows = s.err.map((r) => `<tr><td>${r.code}</td><td>${r.status}</td><td>${r.desc}</td></tr>`).join('');
        const guide = `<h2>Cách dùng</h2><p>${s.definition}</p>
<h3>Tham số input</h3><table><thead><tr><th>Tên</th><th>Vị trí</th><th>Kiểu</th><th>Bắt buộc</th><th>Mô tả</th></tr></thead><tbody>${reqRows}</tbody></table>
<h3>Tham số output</h3><table><thead><tr><th>Trường</th><th>Kiểu</th><th>Mô tả</th></tr></thead><tbody>${resRows}</tbody></table>
<h3>Mã lỗi</h3><table><thead><tr><th>HTTP code</th><th>Status</th><th>Nguyên nhân</th></tr></thead><tbody>${errRows}</tbody></table>
<h3>Sequence diagram</h3><ol>${s.seq.map((st) => `<li><p><strong>${st.title}</strong> — ${st.desc}</p></li>`).join('')}</ol>`;
        const ver = (await m.query(
          `INSERT INTO api_catalog_versions (
             api_catalog_package_id, version_no, state, name, short_description, category_id,
             usage_guide_html, http_method, endpoint_path, input_format, call_mode, sync_timeout,
             sla, tps, latency_p95, throughput, max_payload, rate_limit, encryption,
             mock_req, mock_res, submitted_by
           ) VALUES (
             $1, 1, 'approved', $2, $3, $4, $5, $6, $7, $8, $9, $10,
             $11, $12, $13, $14, $15, $16, $17, $18::jsonb, $19::jsonb, $20
           ) RETURNING id`,
          [
            pid, s.name, s.definition, categoryId, guide, s.method, s.path, s.format, callCols(s).call_mode, callCols(s).sync_timeout,
            s.sla, s.tps, s.latency_p95, s.throughput, s.max_payload, s.rate_limit, s.encryption,
            JSON.stringify(s.mockReq), JSON.stringify(s.mockRes), uploader.id,
          ],
        )) as Array<{ id: number }>;
        await m.query(`UPDATE api_catalog_packages SET active_version_id = $1 WHERE id = $2`, [ver[0].id, pid]);
        published.push({ pid, s, guide, verId: ver[0].id });
      }

      const insertVer = async (args: {
        pid: number; no: number; old: number | null; state: string; s: Sample; guide: string;
        submitter: number; changelog?: string; reject?: string;
      }) => {
        await m.query(
          `INSERT INTO api_catalog_versions (
             api_catalog_package_id, version_no, old_version, state, name, short_description, category_id,
             usage_guide_html, http_method, endpoint_path, input_format, call_mode, sync_timeout,
             sla, tps, latency_p95, throughput, max_payload, rate_limit, encryption,
             mock_req, mock_res,
             submitted_by, changelog_note, reject_reason, reviewed_by, reviewed_at
           ) VALUES (
             $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
             $21::jsonb,$22::jsonb,$23,$24,$25,$26,$27
           )`,
          [
            args.pid, args.no, args.old, args.state, args.s.name + (args.state === 'pending' ? ' (pending)' : args.state === 'rejected' ? ' (rejected)' : ''),
            args.s.definition, categoryId, args.guide, args.s.method, args.s.path, args.s.format,
            callCols(args.s).call_mode, callCols(args.s).sync_timeout, args.s.sla, args.s.tps, args.s.latency_p95, args.s.throughput,
            args.s.max_payload, args.s.rate_limit, args.s.encryption,
            JSON.stringify(args.s.mockReq), JSON.stringify(args.s.mockRes), args.submitter,
            args.changelog ?? null, args.reject ?? null,
            args.state === 'rejected' || args.state === 'approved' ? approver.id : null,
            args.state === 'rejected' || args.state === 'approved' ? new Date() : null,
          ],
        );
      };

      // Pending bumps on published packages → Review queue (uploader submitted).
      for (const row of published.slice(0, 3)) {
        await insertVer({
          pid: row.pid, no: 2, old: 1, state: 'pending', s: row.s, guide: row.guide,
          submitter: uploader.id, changelog: 'Bump chờ duyệt — chỉnh sample + QoS',
        });
      }

      // Approver-owned packages → My Version khi login api_approver.
      const approverSamples = [samples[0], samples[5]];
      for (const [i, s] of approverSamples.entries()) {
        const pkg = (await m.query(
          `INSERT INTO api_catalog_packages (status, created_by, publisher_id, code) VALUES ('active', $1, $2, '') RETURNING id`,
          [approver.id, publisher[0].id],
        )) as Array<{ id: number }>;
        const pid = pkg[0].id;
        await m.query(`UPDATE api_catalog_packages SET code = $1 WHERE id = $2`, [`api_catalog_${pid}`, pid]);
        await m.query(`INSERT INTO api_catalog_package_responsibles (api_catalog_package_id, user_id) VALUES ($1, $2)`, [pid, approver.id]);
        const guide = `<h2>Cách dùng</h2><p>${s.definition}</p><h3>Sequence diagram</h3><ol>${s.seq.map((st) => `<li><p><strong>${st.title}</strong> — ${st.desc}</p></li>`).join('')}</ol>`;
        if (i === 0) {
          const ver = (await m.query(
            `INSERT INTO api_catalog_versions (
               api_catalog_package_id, version_no, state, name, short_description, category_id,
               usage_guide_html, http_method, endpoint_path, input_format, call_mode, sync_timeout,
               sla, tps, latency_p95, throughput, max_payload, rate_limit, encryption,
               mock_req, mock_res, submitted_by, reviewed_by, reviewed_at
             ) VALUES (
               $1,1,'approved',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
               $18::jsonb,$19::jsonb,$20,$21,NOW()
             ) RETURNING id`,
            [
              pid, s.name, s.definition, categoryId, guide, s.method, s.path, s.format, callCols(s).call_mode, callCols(s).sync_timeout,
              s.sla, s.tps, s.latency_p95, s.throughput, s.max_payload, s.rate_limit, s.encryption,
              JSON.stringify(s.mockReq), JSON.stringify(s.mockRes), approver.id, approver.id,
            ],
          )) as Array<{ id: number }>;
          await m.query(`UPDATE api_catalog_packages SET active_version_id = $1 WHERE id = $2`, [ver[0].id, pid]);
          await insertVer({
            pid, no: 2, old: 1, state: 'pending', s, guide, submitter: approver.id, changelog: 'Approver self-bump chờ duyệt',
          });
        } else {
          await insertVer({ pid, no: 1, old: null, state: 'pending', s, guide, submitter: approver.id });
        }
      }

      // Rejected version owned by approver (My Version filter rejected).
      const rej = samples[2];
      const rejPkg = (await m.query(
        `INSERT INTO api_catalog_packages (status, created_by, publisher_id, code) VALUES ('active', $1, $2, '') RETURNING id`,
        [approver.id, publisher[0].id],
      )) as Array<{ id: number }>;
      await m.query(`UPDATE api_catalog_packages SET code = $1 WHERE id = $2`, [`api_catalog_${rejPkg[0].id}`, rejPkg[0].id]);
      await m.query(`INSERT INTO api_catalog_package_responsibles (api_catalog_package_id, user_id) VALUES ($1, $2)`, [rejPkg[0].id, approver.id]);
      await insertVer({
        pid: rejPkg[0].id, no: 1, old: null, state: 'rejected', s: rej,
        guide: `<p>${rej.definition}</p>`, submitter: approver.id, reject: 'Thiếu mô tả QoS / sample không đủ.',
      });

      console.log(`seed-api-catalog-demo-data: ${samples.length} published + pending/review + approver my-version`);
    });
  } finally {
    await ds.destroy();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
