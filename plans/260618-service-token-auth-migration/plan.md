---
title: Migrate Service-Token Auth (render-service-token) from Strapi to NestJS
status: completed
priority: P1
created: 2026-06-18
planDir: plans/260618-service-token-auth-migration
---

# Migrate Service-Token Auth from Strapi to NestJS

## Goal

Port the Strapi `custom-auth` **service-token pair** into NestJS so self-serve
service-to-service auth works:

1. `ServiceTokenGuard` — equivalent of Strapi `authService` middleware (validate a
   service token, attach `req.info.service`).
2. `POST /render-service-token` — admin-gated endpoint that mints a service token and
   persists it to the existing `jwt_tokens` table.

Out of scope (NestJS already has its own equivalents): login, verify-token, profile,
logout, OIDC, refresh.

## Scope decisions (confirmed with user)

- Scope = **service-token pair only** (not full custom-auth API).
- Token store = **reuse existing `jwt_tokens` table** (shared DB `nestjs_strapi_migration`).
- `ServiceTokenGuard` is now wired onto `PATCH service/data-self-serve/:id` (replaced the prior
  `HeaderGuard`), matching Strapi's `authService`-only protection on that route.

## Source / Target

- Source: `strapiv5-old/src/api/custom-auth/{services,controllers,routes,middlewares}/custom-auth.ts`
  + helpers in `strapiv5-old/src/common/util.ts` (`handleGenerateServiceToken`, `verifyTokenService`).
- Target: `nestjs-new/base-be-ts-sql` (NestJS 11 + TypeORM + Postgres).
- Existing reference entity: `database/entities/jwt_tokens.entity.ts` (schema source of truth).

## Phases

| Phase | Title | Status |
|-------|-------|--------|
| 01 | Service-token module: entity, service, guard, render endpoint | completed |

See `phase-01-service-token-module.md`.

## Key risks / open questions

1. **Strapi field-name discrepancy**: `handleGenerateServiceToken` signs `{id, type, sub}`,
   but `authService` reads `payload.service_id` / `service_code` (undefined for minted
   tokens). Port faithfully but expose full decoded payload as service identity; flag for user.
2. **Admin gating granularity**: Strapi restricts to `SUPER_ADMIN`/`SERVICE_ADMIN` roles.
   NestJS native equivalent here = `BearerGuard + IsAdminGuard` (any admin). Finer role
   restriction is a follow-up if required.
3. New dependency `jsonwebtoken` added to mint Strapi-format JWT strings (NestJS uses
   crypto-js elsewhere; service tokens must remain JWT for table compatibility).
