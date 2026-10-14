# Brainstorm: coworker — mỗi channel 1 link

Date: 2026-10-14 · Status: approved → `/ck:plan --tdd`

## Problem

Coworker version chọn nhiều channel (`coworker_version_channels`) nhưng chỉ có 1 `coworker_versions.link` (validate cứng origin Teams). Cần: mỗi channel đi kèm 1 link riêng; validate theo domain của channel, không fix cứng code. Hạn chế sửa DB.

## Current state (scout)

- `coworker_version_channels(coworker_version_id, channel_id)` — join, soft-delete, chưa unique.
- `coworker_versions.link VARCHAR NOT NULL`.
- `coworker-link.util.ts` `assertCoworkerLink`: origin ∈ `['https://teams.microsoft.com']`.
- Write: `coworker-upload.service.ts` createNew / createVersion / editVersion (`assertLookups`, `replaceVersionChannels`).
- Read: `coworker-query.service.ts` `loadChannelsByVersionIds`, comparison (`:493`), diff (`:555,565`).
- DTO: `channel_ids: number[]` + `link: string` (create-package, create-version).
- Channels thực tế: Teams, Outlook, Zalo. User tự thêm/sửa data channel.

## Approaches

| | Approach | Verdict |
|---|---|---|
| A | `link` column trên `coworker_version_channels` + `domain` trên channel | **Chọn.** Mỗi row đã là cặp (version, channel) → đúng ngữ nghĩa, 1 migration |
| B | JSONB `channel_links` trên `coworker_versions` | Loại: trùng join table, dễ lệch |
| C | Map origin theo channel trong code | Loại: user muốn động theo DB |

## Locked decisions

| Topic | Decision |
|---|---|
| Link storage | `coworker_version_channels.link VARCHAR NOT NULL` |
| Uniqueness | 1 channel 1 link / version → unique `(coworker_version_id, channel_id)` WHERE live |
| Old column | **Drop** `coworker_versions.link` (sau backfill) |
| Domain | `ai_hub_coworker_channels.domain VARCHAR NULL`, 1 string/channel, có thể chứa nhiều origin cách nhau `,` (tương lai); split + trim + lowercase + bỏ `/` cuối + bỏ rỗng trước khi validate; data do user tự điền |
| Match rule | `new URL(link).origin` ∈ danh sách domain đã split (domain lưu dạng origin, vd `https://zalo.me`). User ban đầu nói "startsWith domain" — đổi sang so origin vì `startsWith` lọt `https://teams.microsoft.com.evil.vn` / `...@evil.vn` |
| Domain NULL | 400 `INVALID_COWORKER_LINK: channel has no domain configured` (fail closed) |
| Body | `channels: [{ channel_id, link }]` (min 1, unique channel_id); bỏ `channel_ids` + `link` |
| Response | `channels: [{ id, name, link }]`; bỏ `link` cấp version |
| Diff/comparison | base/incoming = list `[{ channel_id, name, link }]` |
| Out of scope | Seed/CRUD channel, skill/prompt/api-catalog |

## Migration (1 file)

1. `ALTER TABLE ai_hub_coworker_channels ADD COLUMN IF NOT EXISTS domain VARCHAR`.
2. `ALTER TABLE coworker_version_channels ADD COLUMN IF NOT EXISTS link VARCHAR`.
3. Backfill: `UPDATE coworker_version_channels vc SET link = v.link FROM coworker_versions v WHERE v.id = vc.coworker_version_id AND vc.link IS NULL`. **Bắt buộc** — không thì mất link khi drop cột.
4. Preflight fail-closed: version không có row channel nào mà có link → abort (tránh mất dữ liệu).
5. `SET NOT NULL` link; unique partial index `(coworker_version_id, channel_id) WHERE deleted_at IS NULL`. Preflight duplicate → abort.
6. `ALTER TABLE coworker_versions DROP COLUMN link`.
- `down`: add `link` lại, fill từ channel row id nhỏ nhất, drop index/cột mới.

## Risks

- **Phải điền `domain` cho Teams (và Outlook/Zalo) trước deploy**, nếu không create/edit coworker 400.
- Breaking contract FE (body + response) → deploy đồng bộ.
- Drop column không rollback dữ liệu đa-link về 1 link (down chỉ lấy link đầu).

## Validation

- Create/bump/edit với 3 channel × 3 link → đọc lại detail/version/diff đúng cặp.
- Link sai origin, origin giả `teams.microsoft.com.evil.vn`, `user@host`, http → 400.
- Channel domain NULL → 400. channel_id trùng trong body → 400.
- Migration up trên data cũ: mọi link cũ chuyển sang row channel; down khôi phục.

## Unresolved

- Có cần hỗ trợ link deep-link scheme không phải https (vd `zalo://`, `msteams:`)? Hiện so origin → scheme lạ có origin `null` → bị chặn.
