---
title: Brainstorm ADFS OIDC SSO Strapi parity
status: approved
date: 2026-09-07
---

# Brainstorm — ADFS OIDC SSO (Strapi → NestJS)

## Problem

Port Strapi `GET /custom-auth/login-sso/oidc` + `GET /custom-auth/oidc/callback` so NestJS matches ADFS login (authorize redirect + callback redirect to FE).

## Requirements

- Start: public GET, pack query into `state`, validate `redirect_url` vs `BASE_END_USER_URL`, 302 ADFS with `response_mode=query`.
- Callback: exchange code, decode JWT `access_token` (not userinfo), find/create user, Nest `createToken`, 302 `{BASE_END_USER_URL}/login?accessToken=&state=`.
- Fail → 302 `/login`.
- Token value = Nest Bearer (not Strapi JWT payload).

## Out of scope

- Logout `id_token_hint`
- `syncGroupSingle`
- Login log table

## Approach

Dedicated `OidcSsoService`. Alias `oidc/authorize` → same authorize builder. Env `OIDC_*` with `SSO_OIDC_*` fallback. TLS skip only if `OIDC_TLS_INSECURE=true`.

## Touchpoints

- `src/modules/auth/auth.controller.ts`
- `src/modules/auth/auth.service.ts`
- `src/modules/auth/oidc-sso.service.ts` (new)
- `src/configuration/env.config.ts`
- tests under `src/modules/auth/`
