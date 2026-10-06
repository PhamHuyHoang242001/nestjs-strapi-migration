# FE: preview file trong skill zip

Repo BE: `GET /v1/skill/items/:id/files/preview?file=<zip_tree.path>`
Auth: cùng quyền download zip active.

## Trim

Trước khi gọi API: `filePath = zipNode.path.trim()`. Không gửi string rỗng.

`file` phải **đúng** `zip_tree[].path` (path đầy đủ, không chỉ basename). Encode query: `encodeURIComponent(filePath)`.

## Không preview skill.md

Nếu basename (sau trim, lowercase) === `skill.md` → dùng `skill_md_content` trên detail/version. **Không** gọi preview.

## Cache (tránh spam unzip)

Key: `${packageId}|${activeVersionId}|${filePath}`

- Hit → render cache, không gọi API.
- Miss → GET preview.
- 200 → lưu `content`.
- 404/400 → **không** cache (user có thể bump zip).
- Invalidate khi `active_version_id` / version_no đổi (reload detail).

In-memory (Map / react-query `staleTime` vài phút). Không cần HTTP cache từ BE.

## Errors

| Status | UI |
|---|---|
| 404 | Không thấy file |
| 400 | Không preview được (không phải text) |
| 403 | Không có quyền download |

Chỉ enable preview trên `zip_tree` node `isDir === false`.
