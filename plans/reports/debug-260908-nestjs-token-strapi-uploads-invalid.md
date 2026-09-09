# Debug: Nest login token → Strapi `/uploads` Invalid token

**Date:** 2026-09-08  
**Symptom:** Login NestJS (user), dùng Bearer token GET file trên Strapi → `Invalid token`. User nói payload “giống Strapi cũ”.

## Root cause (verified in code)

Nest **user login token không phải JWT users-permissions của Strapi**. Hai hệ thống verify khác nhau. Payload “giống” sau khi decode/decrypt không đủ để Strapi `jwt.verify` pass.

### Nest login token (user)

Verified `src/modules/auth/auth.service.ts` `generateToken` + `src/common/utils/common.ts`:

1. Payload encrypt AES-256-CBC (`encryptCryptoDecipher`, key `ENCRYPT_KEY`).
2. Fields map: `time`, `cl`, `uid`, `exp` (`MAPPING_ENCRYPT_TOKEN`).
3. String = `{base64AES}=-={uuid}`.
4. Persist `tokens` table. Nest `BearerGuard` lookup DB (`checkTokenValid`), **không** `jwt.verify`.

Đây **không** phải `header.payload.signature`.

### Strapi `/uploads` (user JWT)

Strapi users-permissions:

```
jwt.verify(token, JWT_SECRET)  // HS256, payload { id: userId, iat, exp }
```

Yêu cầu:

- 3 segment JWT
- Sign bằng **Strapi `JWT_SECRET`** (không phải `ENCRYPT_KEY` / `ADMIN_JWT_SECRET`)
- Claim `id` = user id (số)

Nest token fail ngay bước parse → `JsonWebTokenError: jwt malformed` / **Invalid token**.

### Token Nest **có** JWT nhưng vẫn fail trên `/uploads`

Chỉ **service token** mint JWT:

`src/modules/service-token/service-token.service.ts`:

```
jwt.sign({ id, type, sub: id }, ADMIN_JWT_SECRET)
```

Khác Strapi user JWT:

| | Strapi user | Nest service token |
|---|---|---|
| Secret | `JWT_SECRET` | `ADMIN_JWT_SECRET` (fallback ENCRYPT_KEY) |
| Payload | `{ id }` | `{ id, type, sub }` |
| Lookup | `up_users` | `jwt_tokens` |

Dùng service token GET `/uploads` vẫn Invalid token (sai secret + không phải user JWT).

### Guard file trên Nest cũng lệch

`TransformFileAuthGuard` (`src/common/transform-file/transform-file-auth.guard.ts`) gọi `JwtService.verify(..., JWT_SECRET)` + Redis allowlist. Login token AES **không** pass guard này. File qua Nest `media/transform-file` cũng 401/redirect nếu dùng token login hiện tại.

## Vì sao “payload giống Strapi cũ”

So sánh **nội dung user** (`id`, email, …) hoặc decrypt Nest vs decode JWT Strapi: `uid` ≈ `id`. **Format + chữ ký** khác. Strapi không decrypt AES; chỉ `jwt.verify`.

Strapi cũ user login: `jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn })`. Nest không mint cái đó.

## Hypotheses loại

1. User id lệch — Nest BearerGuard login OK ⇒ id/token valid **trên Nest**.
2. Token hết hạn Strapi — malformed fail trước hết hạn.
3. OIDC/SSO — callback vẫn `createToken` AES (`oidc-sso.service.ts`).

## Cách xác nhận nhanh

1. Token login Nest: có chứa `=-`? Có → AES, không phải JWT.
2. `token.split('.').length === 3`? Không → Strapi luôn invalid.
3. JWT thật: decode header `alg` + payload; `jwt.verify(token, process.env.JWT_SECRET)` **của Strapi**.

## Hướng xử lý (chưa implement — debug only)

Muốn FE dùng **cùng** Bearer GET Strapi `/uploads`:

- Nest login mint **thêm** JWT `{ id: userId }` sign `JWT_SECRET` **cùng secret Strapi**, hoặc
- Proxy file qua Nest (và sửa `TransformFileAuthGuard` nhận AES token / `tokens` table), hoặc
- Public `/uploads` (không auth) nếu file không private.

Không dùng `ADMIN_JWT_SECRET` / service token cho user media.

## Unresolved

- Strapi env `JWT_SECRET` runtime (repo Nest không chứa). Cần so với secret Strapi deploy.
- File URL FE đang hit Strapi host hay Nest `transform-file`?
