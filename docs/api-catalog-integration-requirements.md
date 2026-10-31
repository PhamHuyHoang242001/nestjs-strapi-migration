# API Catalog — Template yêu cầu tích hợp gọi API (đồng bộ / bất đồng bộ)

> Mục đích: chuẩn hoá cách AI Hub (API Catalog) gọi API của bên tích hợp. Một luồng duy nhất cho FE, khác nhau ở BE: **đồng bộ** = BE gọi trực tiếp; **bất đồng bộ** = BE đẩy job vào microservice (Bull) → worker gọi đối tác → đối tác callback.
> Sơ đồ động: [api-catalog-integration-flow.html](api-catalog-integration-flow.html)

---

## 1. Phạm vi

| Trong phạm vi | Ngoài phạm vi |
|---|---|
| User gọi thử API đã cấu hình trong catalog (`api_catalog_packages` active, phiên bản active) | Cấu hình/duyệt API (đã có) |
| Lưu kết quả cuối theo `user_id + api_id`, lưu lịch sử mọi lần gọi | Hiện thực microservice noti (đã có — chỉ gọi vào) |
| Quota 5 lượt / user / ngày cho toàn bộ API | Giới hạn TPS thật theo `rate_limit`/`tps` của catalog (hiện chỉ là text) |
| 3 lớp xác thực: FE→BE, BE→đối tác, đối tác→BE (callback) | |

`api_id` = `api_catalog_packages.id` (ổn định qua các phiên bản). Mỗi run ghi thêm `api_version_id` đã dùng.

---

## 2. Thông tin cần đối tác cung cấp (checklist)

### 2.1 Kết nối & xác thực (BE → đối tác)
- [ ] Base URL gateway từng môi trường (dev / staging / prod)
- [ ] OAuth2 **client_credentials**: token URL, `client_id`, `client_secret`, `scope`, thời hạn token (`expires_in`)
- [ ] Token gửi dạng `Authorization: Bearer <token>`? Có cần header khác (VD `x-partner-code`)?
- [ ] Danh sách IP egress của mình cần whitelist bên đối tác? Có yêu cầu mTLS không?
- [ ] Giới hạn gọi (TPS / ngày) phía đối tác, mã lỗi khi vượt (thường `429` + `Retry-After`)

### 2.2 Đặc tả mỗi API
- [ ] Method + path (khớp `http_method`, `endpoint_path` trong catalog)
- [ ] Kiểu input: body JSON / query / upload file (khớp `input_format`)
- [ ] Request/response mẫu (khớp `mock_req`, `mock_res`), kích thước tối đa (`max_payload`)
- [ ] Loại: **đồng bộ** (trả kết quả trong cùng HTTP) hay **bất đồng bộ** (trả `202` + xử lý sau)
- [ ] Đồng bộ: thời gian phản hồi p95 và timeout tối đa phía đối tác (để đặt `sync_timeout` và hard timeout)
- [ ] Bất đồng bộ: thời gian xử lý tối đa (để đặt deadline), có API tra trạng thái theo `request_id` không

### 2.3 Idempotency
- [ ] Đối tác nhận header `X-Request-Id` (uuid do mình sinh) và **không xử lý 2 lần** cùng một id
- [ ] Gửi lại cùng `X-Request-Id` thì trả lại kết quả cũ (an toàn khi mình retry do lỗi mạng)

### 2.4 Callback (chỉ API bất đồng bộ — đối tác → BE)
- [ ] Đối tác POST kết quả về `callback_url` mình gửi kèm request (hoặc URL cố định đăng ký trước)
- [ ] Body callback chứa tối thiểu: `request_id`, `status` (`success` | `failed`), `data` hoặc `error {code, message}`
- [ ] Ký **HMAC-SHA256**: header `X-Signature = hex(HMAC(secret, timestamp + "." + rawBody))`, `X-Timestamp` (epoch giây)
- [ ] Shared secret callback (khác `client_secret`), quy trình xoay vòng secret
- [ ] Retry callback khi mình trả không phải 2xx: số lần, khoảng cách (VD 1m, 5m, 15m)
- [ ] IP nguồn của callback (để whitelist, tuỳ chọn)

### 2.5 Mã lỗi
- [ ] Bảng mã lỗi đối tác → mình phân loại: **lỗi đầu vào (4xx, không hoàn lượt)** hay **lỗi hệ thống (5xx/timeout, hoàn lượt)**

---

## 3. Yêu cầu nội bộ (BE)

### 3.1 Endpoint (đề xuất)
| Method | Path | Mô tả |
|---|---|---|
| `POST` | `/v1/api-catalog/items/:id/calls` | Gọi API. Body = payload theo `input_format`. Trả `200` (sync xong kịp) hoặc `202 {run_id, status:"processing"}` |
| `GET` | `/v1/api-catalog/items/:id/calls/current` | find-one: state hiện tại của user với API này (payload cuối, response cuối, status) |
| `POST` | `/v1/api-catalog/items/:id/calls/reset` | Xoá kết quả cuối, về `idle`. Không tốn lượt. Cấm khi đang `processing` |
| `GET` | `/v1/api-catalog/items/:id/calls/history` | Lịch sử call của chính user (phân trang) |
| `GET` | `/v1/api-catalog/calls/quota` | `{limit:5, used, remaining, reset_at}` |
| `POST` | `/v1/integrations/partner/callback` | Callback của đối tác (không dùng JWT user; xác thực HMAC) |

### 3.2 Dữ liệu (đề xuất)
**`api_call_states`** — 1 dòng / (`user_id`, `api_id`), UNIQUE.
`status` (`idle|processing|success|failed|timeout`), `last_run_id`, `last_payload jsonb`, `last_response jsonb`, `last_http_status`, `last_error_code`, `started_at`, `finished_at`, `updated_at`.

**`api_call_runs`** — lịch sử, mỗi lần gọi 1 dòng, lưu đầy đủ, giữ vĩnh viễn.
`id`, `request_id uuid UNIQUE`, `user_id`, `api_id`, `api_version_id`, `call_mode`, `payload jsonb`, `response jsonb`, `http_status`, `status`, `error_code`, `error_message`, `partner_job_id`, `latency_ms`, `quota_refunded bool`, `deadline_at`, `started_at`, `finished_at`.
Index: (`user_id`, `started_at`) cho quota & lịch sử; (`status`, `deadline_at`) cho job dọn kẹt.

> ⚠️ Lưu ý (theo quyết định lưu full, giữ mãi): bảng sẽ phình và chứa dữ liệu nhạy cảm → chỉ cho chính user + admin đọc, không log body ra file log, cân nhắc partition theo tháng về sau.

### 3.3 Quy tắc
1. **Kiểm tra khi gọi** (1 transaction, `pg_advisory_xact_lock(user_id)` để 2 request song song không vượt quota):
   - API package `active` + có phiên bản active, nếu không → `404/400`
   - State đang `processing` → `409 RUN_IN_PROGRESS`
   - Số run hôm nay (giờ VN, `quota_refunded = false`) ≥ 5 → `429 QUOTA_EXCEEDED`
   - Validate payload theo `input_format`, `max_payload`
   - Insert run + upsert state = `processing`, `deadline_at` = now + deadline
2. **Quota**: 5 lượt / user / ngày cho **tất cả** API, reset 00:00 Asia/Ho_Chi_Minh. Lỗi 5xx/timeout/network phía đối tác → `quota_refunded = true`. Lỗi 4xx đầu vào → không hoàn. Reset không tốn lượt.
3. **Kết thúc run** (dùng chung cho sync/async/callback/sweeper): update run + state **có điều kiện** `WHERE status = 'processing' AND last_run_id = :run` → chỉ lần kết thúc đầu tiên thắng (chống callback trùng / sweeper đè). Sau đó gửi noti.
4. **Noti**: gọi microservice noti với `{user_id, type:"API_CALL_FINISHED", api_id, run_id, status}`. Không gửi payload/response qua noti — FE tự gọi find-one.
5. **Job dọn kẹt** (cron mỗi 1 phút): run `processing` quá `deadline_at` → `timeout`, hoàn lượt, gửi noti. Bắt buộc vì sync chạy trong tiến trình BE — restart là mất.
6. **Reset**: state về `idle`, xoá `last_payload/last_response`; lịch sử giữ nguyên.

### 3.4 Đồng bộ
- BE gọi đối tác với **hard timeout** (VD 60s) nhưng chỉ **giữ HTTP với FE tối đa `sync_timeout`** (VD 10s).
- Xong trong `sync_timeout` → `200` + kết quả (vẫn gửi noti cho tab khác).
- Quá `sync_timeout` → `202 processing`; promise tiếp tục chạy nền, xong thì kết thúc run + noti.
- Retry: chỉ retry khi lỗi mạng/`502/503/504` và đối tác hỗ trợ `X-Request-Id`; tối đa 1 lần.

### 3.5 Bất đồng bộ
- BE (sau transaction) đẩy message vào microservice qua Redis transport → microservice `queue.add('call', {...}, { jobId: request_id, attempts: 3, backoff: exponential })`. `jobId = request_id` ⇒ đẩy trùng không tạo 2 job.
- Trả FE `202 processing` ngay.
- Worker: lấy token → gửi request kèm `X-Request-Id`, `callback_url` → đối tác trả `202` (+ `partner_job_id`) → lưu `partner_job_id`.
- Đối tác callback → BE verify HMAC + timestamp (lệch ≤ 5 phút) → tìm run theo `request_id` → kết thúc run (quy tắc 3.3.3) → trả `200` cho đối tác (kể cả khi đã xử lý rồi — idempotent).
- Dự phòng: worker thêm delayed job "check-status" sau X phút; nếu run vẫn `processing` → `GET status` theo `request_id`; vẫn chưa có thì lặp tới `deadline_at`.
- Đẩy queue thất bại (Redis chết) → kết thúc run `failed` + hoàn lượt ngay, trả `503`.

### 3.6 Xác thực — 3 lớp
| Lớp | Cơ chế | Lưu ý |
|---|---|---|
| FE → BE | Bearer JWT hiện có (`BearerGuard`) | Mọi query lọc `user_id = caller`; không cho đọc run của người khác |
| BE/worker → đối tác | OAuth2 client_credentials | Token cache Redis key `partner:token`, TTL = `expires_in - 60s`; single-flight (`SET NX` lock) để không xin token dồn dập; gặp `401` → xoá cache, xin lại, thử 1 lần. Secret ở env/vault, **không** lưu DB/log |
| Đối tác → BE (callback) | HMAC-SHA256 + timestamp + idempotent `request_id` | So sánh chữ ký bằng `timingSafeEqual`; đọc **raw body** trước khi parse; tuỳ chọn IP whitelist; endpoint tách khỏi `BearerGuard` |
| BE ↔ microservice | Redis nội bộ | Không expose ra ngoài; job chỉ chứa `run_id` + dữ liệu cần thiết |

---

## 4. Yêu cầu FE

1. Vào trang 1 API → `GET .../calls/current` → hiển thị theo state:
   - `idle`: form payload (mặc định từ `mock_req`), nút **Gọi**, hiện quota còn lại
   - `processing`: spinner, khoá **Gọi** và **Reset**, bắt đầu chờ (bước 3)
   - `success/failed/timeout`: hiện payload cuối + response cuối, nút **Reset** (mới được gọi lần mới)
2. Bấm **Gọi** → `200` hiện kết quả; `202` → trạng thái processing; `409/429` → báo lỗi tương ứng.
3. Chờ kết quả: lắng nghe noti `API_CALL_FINISHED` (đúng `api_id`) → gọi find-one. **Sau 30s chưa có noti** → poll find-one **mỗi 5s** đến khi state khác `processing` hoặc quá `deadline_at` (dừng poll khi rời trang).
4. Thoát ra / vào lại bất kỳ lúc nào: luôn bắt đầu từ bước 1 (find-one là nguồn sự thật, noti chỉ là tín hiệu).

---

## 5. Tham số cấu hình (env)
| Biến | Gợi ý | Ý nghĩa |
|---|---|---|
| `PARTNER_BASE_URL`, `PARTNER_TOKEN_URL` | — | Gateway đối tác |
| `PARTNER_CLIENT_ID`, `PARTNER_CLIENT_SECRET`, `PARTNER_SCOPE` | — | OAuth2 client_credentials |
| `PARTNER_CALLBACK_SECRET` | — | HMAC callback |
| `PARTNER_CALLBACK_URL` | `https://<be>/api/v1/integrations/partner/callback` | Gửi kèm request async |
| `API_CALL_DAILY_QUOTA` | `5` | Quota / user / ngày |
| `API_CALL_SYNC_HARD_TIMEOUT_MS` | `60000` | Hard timeout gọi đồng bộ |
| `API_CALL_ASYNC_DEADLINE_MS` | `900000` | Hạn tối đa chờ kết quả async |
| `API_CALL_ASYNC_STATUS_CHECK_MS` | `120000` | Sau bao lâu không có callback thì tự hỏi trạng thái |
| FE: `NOTI_FALLBACK_AFTER_MS` / `POLL_INTERVAL_MS` | `30000` / `5000` | Polling dự phòng |

---

## 6. Tiêu chí nghiệm thu
- [ ] Gọi đồng bộ nhanh → `200`, state `success`, có 1 dòng lịch sử
- [ ] Gọi đồng bộ chậm hơn `sync_timeout` → `202`; rời trang, vào lại thấy `processing`; khi xong nhận noti, find-one ra kết quả
- [ ] Gọi bất đồng bộ → `202`; callback hợp lệ → `success`; callback trùng không tạo thay đổi; callback sai chữ ký → `401`
- [ ] Không có callback → worker tự hỏi trạng thái; quá deadline → `timeout`, hoàn lượt
- [ ] Đang `processing` gọi tiếp → `409`; reset → `409`
- [ ] Lượt thứ 6 trong ngày → `429`; lỗi 5xx đối tác được hoàn lượt
- [ ] Mất noti → FE vẫn ra kết quả nhờ poll 5s sau 30s
- [ ] BE restart giữa lúc gọi đồng bộ → sweeper chuyển `timeout` + noti
- [ ] User A không đọc được state/lịch sử của user B

---

## 7. Câu hỏi còn mở
1. Đối tác có API tra trạng thái theo `request_id` không (cho dự phòng async)?
2. Callback URL gửi kèm từng request hay đăng ký cố định?
3. Kích thước response tối đa (lưu jsonb full) — có API trả file không?
4. Quota 5/ngày có ngoại lệ cho admin/super_admin không?
5. Hard timeout đồng bộ và deadline bất đồng bộ cụ thể bao nhiêu?
