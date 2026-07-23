# Codebase Summary

**Source snapshot:** repository scan  
**Date:** 2026-07-23

## Overview

This repository is a NestJS backend with authorization, data access, BI Payment, user/role management, reporting, and seeder/migration support. The current work centers on the BI Payment permission rebuild and the shared authorization layer that gates program, template, document, checklist, comment, and other-file flows.

## Major Areas

| Area | Notes |
| --- | --- |
| `src/common/authorization/` | Permission guard, data access interceptor, cache, owner-scope helpers, and query services. |
| `src/modules/bi-payment/` | Program, template, document, checklist, comment, other-file, history, report, and shared step-scope logic. |
| `src/modules/data-access/` | Record-level data access APIs and helpers used by program-scoped authorization. |
| `src/modules/role/` and `src/modules/users/` | Role/permission management, user role assignment, and related queries. |
| `src/migration/` and `src/deferred-migrations/` | TypeORM migrations, including the BI Payment permission addition and deferred cleanup. |
| `src/seeders/` | Permission and role seeds used to bootstrap module IDs and relationships. |
| `plans/` | Implementation plans, rollout notes, and review reports. |

## Current BI Payment Authorization Shape

| Topic | Current behavior |
| --- | --- |
| Program permissions | 8-code matrix: view, create, edit, delete, upload, upload_recon, approve, confirm. |
| Template access | `bp_template_create` and `bp_template_delete` stay separate from content-view. |
| Document access | Full upload covers all worksteps; recon upload is own-only on the recon workstep. |
| Checklist access | CRUD uses upload; approval uses approve. |
| Confirm flow | `bp_program_confirm` gates `pic-confirm-final-link`. |

## Operational Notes

- Run `repomix` before major docs audits so the summary reflects the current tree.
- Keep docs concise and source-backed; avoid inventing APIs or routes not present in code.
- Prefer parent-scope permission models for child records under `bi_payment_programs`.

## References

- [Authorization system overview](../AUTHORIZATION_SYSTEM_VI.md)
- [BI Payment rollout checklist](../plans/260723-1600-bi-payment-program-permission-rebuild/reports/rollout-checklist.md)
