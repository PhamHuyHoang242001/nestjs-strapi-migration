// Shared parts of the imports that create or update by code (App thụ hưởng, logical terms, API / SFTP services):
// a row whose code already exists updates that record, otherwise it creates one.
import { BadRequestException } from '@nestjs/common';
import { DataHubCaller, DataHubAccessService } from '../common/data-hub-access.service';
import { DataHubPermissionCode } from '../common/data-hub-permission-codes';
import { errorText } from './import-helpers.util';
import { ImportIssueCollector, RowOutcome } from './import-workbook.util';

export type UpsertAction = 'create' | 'update';
// valid = passed a dry run; unchanged = matched a record already holding the same values.
export type UpsertStatus = 'valid' | 'created' | 'updated' | 'unchanged' | 'failed';

export interface UpsertEntry {
  sheet: string;
  row: number;
  ref: string;
  action: UpsertAction;
  status: UpsertStatus;
  id?: number;
  code?: string;
}

export interface UpsertSummary {
  total: number;
  valid: number;
  created: number;
  updated: number;
  unchanged: number;
  failed: number;
}

// The caller's create / update rights of one import, read once per upload.
export interface UpsertRights {
  create: boolean;
  update: boolean;
}

export async function loadUpsertRights(
  access: DataHubAccessService,
  caller: DataHubCaller,
  codes: { create: DataHubPermissionCode; update: DataHubPermissionCode },
): Promise<UpsertRights> {
  const [create, update] = await Promise.all([
    access.hasCode(caller, codes.create),
    access.hasCode(caller, codes.update),
  ]);
  return { create, update };
}

// A row needs the right of what it does: creating needs the create code, updating the update code.
export function checkRowRight(
  rights: UpsertRights,
  action: UpsertAction,
  at: { sheet: string; row: number; key: string },
  what: string,
  issues: ImportIssueCollector,
): void {
  if (rights[action]) return;
  const verb = action === 'create' ? 'tạo' : 'cập nhật';
  issues.add(at.sheet, at.row, at.key, 'PERMISSION_DENIED', `Bạn không có quyền ${verb} ${what}`);
}

const isNoChanges = (err: unknown): boolean =>
  err instanceof BadRequestException && errorText(err).startsWith('NO_CHANGES');

// Runs the write of one valid row and records its outcome on the entry; a failed write is reported on the row.
// An update that changes nothing is "unchanged", not an error.
export async function writeRow(
  entry: UpsertEntry,
  issues: ImportIssueCollector,
  write: () => Promise<{ id: number; code?: string }>,
): Promise<void> {
  try {
    const res = await write();
    Object.assign(entry, { status: entry.action === 'create' ? 'created' : 'updated', id: res.id, code: res.code });
  } catch (err) {
    if (entry.action === 'update' && isNoChanges(err)) {
      entry.status = 'unchanged';
      return;
    }
    entry.status = 'failed';
    issues.add(
      entry.sheet,
      entry.row,
      undefined,
      entry.action === 'create' ? 'CREATE_FAILED' : 'UPDATE_FAILED',
      errorText(err),
    );
  }
}

export const rowOutcome = (status: UpsertStatus): RowOutcome => status;

// Note shown in the result file next to the row status.
export function rowNote(entry: UpsertEntry, label: string): string | undefined {
  if (entry.status === 'valid') return entry.action === 'create' ? 'Sẽ tạo mới' : `Sẽ cập nhật ${label} đã có`;
  if (entry.status === 'created') return entry.code ? `Đã tạo: ${entry.code}` : 'Đã tạo';
  if (entry.status === 'unchanged') return 'Dữ liệu giống hệt bản ghi đang có';
  return undefined;
}

export function summarize(entries: UpsertEntry[]): UpsertSummary {
  const count = (s: UpsertStatus) => entries.filter((e) => e.status === s).length;
  const failed = count('failed');
  return {
    total: entries.length,
    valid: entries.length - failed,
    created: count('created'),
    updated: count('updated'),
    unchanged: count('unchanged'),
    failed,
  };
}

// Codes repeated in the file (normalized by `norm`), each reported on its own row.
export function inFileCounts(codes: string[], norm: (code: string) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const c of codes) if (c) counts.set(norm(c), (counts.get(norm(c)) ?? 0) + 1);
  return counts;
}
