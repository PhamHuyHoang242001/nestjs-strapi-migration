# Phase 01 — Service-Token Module

**Priority:** P1 | **Status:** planned

## Overview

Create a small `service-token` module that ports Strapi's service-token mint + validate
logic, plus a `ServiceTokenGuard`. Reuses existing `jwt_tokens` table.

## Key insights (from scout)

- `jwt_tokens` table already exists (shared DB). Reference: `database/entities/jwt_tokens.entity.ts`
  → cols `token, type(enum 'service-token'|...), is_delete, name, expired_at, user_id, created_by, updated_by`.
- Strapi mint (`handleGenerateServiceToken`): `jwt.sign({id, type, sub:id}, ADMIN_JWT_SECRET)` — no expiry.
  Then persists row `{type:'service-token', token, is_delete:false, name:id}`.
- Strapi validate (`verifyTokenService`): `parseJWTToken` (base64 decode, NO signature verify)
  + DB lookup `{token, type:'service-token', is_delete:false}`. Returns decoded payload or null.
- Strapi `authService` middleware: reads Bearer from `Authorization`, validates, sets
  `ctx.state.service = {serviceId, serviceCode, ip}`.
- Render endpoint gated by `authAdmin` + role check `SUPER_ADMIN|SERVICE_ADMIN`.
- NestJS has no `jsonwebtoken`; uses crypto-js. Signing secret: add `ADMIN_JWT_SECRET`
  (default to `ENCRYPT_KEY`). NestJS guards set `req.info`.

## Requirements

**Functional**
- `POST /render-service-token` body `{ type: string, id: string }` → `{ serviceToken, type: 'service-token' }`.
  Admin-only. Persists row in `jwt_tokens`.
- `ServiceTokenGuard`: validates Bearer service token, attaches `req.info.service`,
  throws `UnauthorizedException` if missing/invalid. NOT applied to any route in this phase.

**Non-functional**
- Match existing NestJS module/entity conventions (`src/modules/databases/*.entity.ts`,
  `TypeOrmModule.forFeature`, repository extends `BaseRepository`).
- Files < 200 lines, kebab-case names.

## Related code files

**Create**
- `src/modules/databases/jwt-token.entity.ts` — TypeORM entity mapping `jwt_tokens` (active app copy
  of the reference entity; use `JwtTokensTypeEnum`).
- `src/modules/service-token/service-token.service.ts` — `generateServiceToken({type,id})`,
  `verifyServiceToken(token)`.
- `src/modules/service-token/repository/jwt-token.repository.ts` — extends `BaseRepository<JwtToken>`.
- `src/modules/service-token/service-token.controller.ts` — `POST /render-service-token`.
- `src/modules/service-token/dto/render-service-token.dto.ts` — `{ type, id }` with validation.
- `src/common/guards/service-token.guard.ts` — `ServiceTokenGuard`.

**Modify**
- `src/modules/service-token/service-token.module.ts` (new) — wire entity, repo, service, controller,
  export `ServiceTokenService` + guard provider.
- `src/app.module.ts` — register `ServiceTokenModule`.
- `src/common/guards/index.ts` — export `service-token.guard`.
- `src/configuration/env.config.ts` — add `ADMIN_JWT_SECRET` (default `ENCRYPT_KEY`).
- `package.json` — add `jsonwebtoken` + `@types/jsonwebtoken`.

**Do NOT modify**
- `src/modules/data-self-serve/data-self-serve.controller.ts` (guard wiring deferred per user).

## Implementation steps

1. Add `jsonwebtoken` + `@types/jsonwebtoken` (npm install).
2. Add `ADMIN_JWT_SECRET` to `env.config.ts` (`process.env.ADMIN_JWT_SECRET ?? ENCRYPT_KEY`).
3. Create `jwt-token.entity.ts` (`@Entity('jwt_tokens')`, enum `JwtTokensTypeEnum`).
4. Create `jwt-token.repository.ts` (BaseRepository pattern, like `token.repository.ts`).
5. Create `service-token.service.ts`:
   - `generateServiceToken({type,id})`: `jwt.sign({id, type, sub:id}, ADMIN_JWT_SECRET)`; save row
     `{type:SERVICE_TOKEN, token, is_delete:false, name:id}`; return `{serviceToken, type:SERVICE_TOKEN}`.
   - `verifyServiceToken(token)`: decode payload (base64, no verify — faithful), DB lookup
     `{token, type:SERVICE_TOKEN, is_delete:false}`; return payload or null.
6. Create `ServiceTokenGuard`: parse `Authorization: Bearer <token>`; `verifyServiceToken`;
   on success set `req.info.service = { id, type, ...payload, ip }`; else throw Unauthorized.
   (Guard pulls `ServiceTokenService` via DI.)
7. Create `render-service-token.dto.ts` + controller `POST /render-service-token`
   `@UseGuards(BearerGuard, IsAdminGuard)`; returns service mint result.
8. Create `service-token.module.ts`; register in `app.module.ts`; export guard from guards index.
9. `npm run build` — fix compile errors.

## Todo list

- [ ] add jsonwebtoken dep
- [ ] env ADMIN_JWT_SECRET
- [ ] jwt-token.entity.ts
- [ ] jwt-token.repository.ts
- [ ] service-token.service.ts
- [ ] service-token.guard.ts
- [ ] render-service-token.dto.ts + controller
- [ ] service-token.module.ts + app.module registration + guards index export
- [ ] build passes
- [ ] tests (tester) + review (code-reviewer)

## Success criteria

- `npm run build` clean.
- `POST /render-service-token` (admin) returns `{ serviceToken, type:'service-token' }` and writes a
  `jwt_tokens` row.
- `ServiceTokenGuard` validates a minted token (decode + DB lookup) and rejects invalid/deleted tokens.
- No change to existing auth/data-self-serve behavior (guard not wired anywhere).

## Security considerations

- Mint endpoint admin-gated (`BearerGuard + IsAdminGuard`). Role-granularity nuance flagged in plan.md.
- Validation relies on DB record + `is_delete` flag (faithful to Strapi); revocation = set `is_delete=true`.

## Next steps

- User wires `ServiceTokenGuard` onto `PATCH service/data-self-serve/:id` (and other service routes) when ready.
