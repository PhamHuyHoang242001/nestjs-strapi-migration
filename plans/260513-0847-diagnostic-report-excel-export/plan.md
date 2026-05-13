---
title: "Diagnostic Report Excel Export"
description: "Add Excel file export to download endpoint using exceljs, matching Strapi exportExcelFile behavior"
status: pending
priority: P1
effort: 2h
branch: main
tags: [diagnostic-report, excel, export, download, migration]
blockedBy: []
blocks: []
planDir: plans/260513-0847-diagnostic-report-excel-export
---

# Plan — Diagnostic Report Excel Export

## Context

`GET /admin/diagnostic/report/download` currently returns JSON array. Strapi returns Excel file stream via `exportExcelFile()` utility. Need to match Strapi behavior — generate .xlsx and stream to client.

**Source (Strapi):** `strapiv5-old/src/common/util.ts:468-502` (exportExcelFile)
**Source (Strapi):** `strapiv5-old/src/api/bi-hub-report/services/bi-diagnostic-admin.ts:2305-2560` (downloadReportDiagnostic)
**Target (NestJS):** `nestjs-new/base-be-ts-sql/src/modules/bi-hub-diagnostic-report/`

## Library Choice

Use `exceljs` (not `@e965/xlsx`): better TS types, native streaming, NestJS Response pipe.

## Excel Columns (adapted from Strapi, removed deprecated fields)

| Header Key | Column Label | Source |
|---|---|---|
| `name` | Report Analysis | `report.name` |
| `bicc_name` | BICC Department | `bicc_department.name` |
| `bu_name` | BU Name | `report.bu_name` |
| `insight` | Insight | `report.insight` (JSON array → join) |
| `labels` | Labels | `labels.name` (join comma) |
| `scopes` | Scope | `report.txt_diagnostic_scope` |
| `is_sensitive` | Sensitive Data | `report.is_sensitive` |
| `file_url` | File URL | `latest file.file_url` |
| `icon` | Icon | `report.icon` |
| `updated_by` | Updated By | join users.email |
| `updated_at` | Updated At | format DD/MM/YYYY HH:mm |

## Files to Modify/Create

| File | Action |
|------|--------|
| `package.json` | `npm install exceljs` |
| `src/common/utils/export-excel.helper.ts` | **Create** — shared utility |
| `bi-hub-diagnostic-report-admin.controller.ts` | Modify — add `@Res()` for streaming |
| `bi-hub-diagnostic-report-write.service.ts` | Modify — `download()` returns Excel buffer |

## Phases

| Phase | File | Status | Effort |
|-------|------|--------|--------|
| 1 | [phase-01-install-and-utility.md](phase-01-install-and-utility.md) | pending | 0.5h |
| 2 | [phase-02-download-excel-integration.md](phase-02-download-excel-integration.md) | pending | 1h |
| 3 | [phase-03-verify.md](phase-03-verify.md) | pending | 0.5h |
