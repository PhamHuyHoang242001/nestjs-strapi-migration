# Brainstorm: AI Hub micro-cache 10s

Date: 2026-10-16 · Status: approved (design) → plan

## Problem

AI Hub catalog published to many users. Burst (vd 100 user cùng mở 1 trang trong 10s) = mỗi request 6-7 query (list + count + category + publisher + PIC + supporter + coworker). Muốn giảm tải DB; chấp nhận dữ liệu trễ ~10s.

## Scout

- Redis có sẵn (`RedisAdapter`, ioredis) — chỉ cache perm (300s), owner-scope (120s), data-access (120s). AI Hub data chưa cache.
- `GET items` `status=active`: không phụ thuộc user (`viewerId` chỉ dùng cho `own-inactive`). skill/prompt/api-catalog cùng pattern.
- `GET /asset-hub/latest`: global.
- `GET /asset-hub/stats`: counts global + `my_versions` per-user **chung 1 SQL** (`latest-artifacts.service.ts` `fetchWorkspaceStats`) → phải tách.
- 1 instance backend.
- Side finding: 4 query service gọi `PermissionQueryService.getUserPermissions` trực tiếp (không cache); `RedisAdapter.unlinkKeyByPattern` dùng `KEYS` (blocking). Không xử lý đợt này.

## Approaches

| | Approach | Verdict |
|---|---|---|
| A | In-memory micro-cache TTL 10s + single-flight + max entries | **Chọn**: 1 instance, 0 network hop, single-flight chặn stampede lượt đầu |
| B | Redis TTL 10s | Loại đợt này: thêm round-trip, chưa cần multi-instance; interface giữ để swap sau |
| C | TTL + version-counter invalidation | Loại: user chấp nhận trễ 10s (YAGNI) |
| D | HTTP cache / ETag | Loại: Bearer per-user, ít lợi |

## Locked decisions

| Topic | Decision |
|---|---|
| Store | In-process Map, TTL 10s, max ~500 keys (evict oldest) |
| Stampede | Single-flight: concurrent miss cùng key share 1 promise; lỗi không cache |
| Scope | `GET items` skill/prompt/api-catalog (chỉ `status=active`), `GET /asset-hub/latest`, `GET /asset-hub/stats` |
| List key | workspace + normalized query (sorted keys: page, limit, search, filters, sort) |
| Latest key | `latest:{limit}` |
| Stats | Cache counts chung `stats:counts`; tách `my_versions` thành query per-user riêng (nhẹ); response shape giữ nguyên |
| Invalidation | Không (TTL only) |
| Out of scope | Detail, coworker, Redis, ETag, perm-cache swap, KEYS fix |

## Risks

- Shared object reference → downstream không được mutate. Services hiện trả object mới; thêm test.
- Memory: cap entries.
- Tests: cần reset cache giữa test (expose `clear()`).
- Stale ≤10s sau approve/toggle — đã chấp nhận.

## Validation

- Unit: TTL hết hạn → reload; concurrent miss → loader gọi 1 lần; loader throw → không cache, request sau gọi lại; cap evict.
- List: `status=active` 2 lần trong TTL → query 1 lần; `status=inactive` → luôn query.
- Stats: counts cache chung, `my_versions` đúng theo từng user.

## Unresolved

- Giá trị cap 500 keys có đủ? (phụ thuộc số tổ hợp search/filter thực tế).
