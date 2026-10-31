// Small helpers shared by the imports: cell resolvers, reference lookups, error text, the run guard, controller
// helpers and example codes.
import {
  applyDecorators,
  BadRequestException,
  ConflictException,
  HttpException,
  Logger,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes } from '@nestjs/swagger';
import * as dayjs from 'dayjs';
import { Response } from 'express';
import { memoryStorage } from 'multer';
import { DataSource } from 'typeorm';
import { activeSql, liveSql } from '../common/data-hub-query.util';
import {
  IMPORT_FILE_BYTES,
  ImportIssueCollector,
  ImportLayout,
  ImportRow,
  sheetDef,
  splitList,
} from './import-workbook.util';

// Required cells left empty; the DTO check would also catch them, but with a less useful message.
export function checkRequired(layout: ImportLayout, sheet: string, r: ImportRow, issues: ImportIssueCollector): void {
  for (const c of sheetDef(layout, sheet).columns) {
    if (c.level === 'r' && r.values[c.key] === '') issues.add(sheet, r.row, c.key, 'REQUIRED', 'Không được để trống');
  }
}

// Id of the code in a cell, or an error on the cell when the code is unknown; undefined for an empty cell.
export function lookupCode(
  sheet: string,
  r: ImportRow,
  key: string,
  map: Map<string, number>,
  issues: ImportIssueCollector,
): number | undefined {
  const code = r.values[key];
  if (code === '') return undefined;
  const id = map.get(lower(code));
  if (id === undefined) issues.add(sheet, r.row, key, 'CODE_NOT_FOUND', `Mã "${code}" không tồn tại`);
  return id;
}

// Ids of a `;`-separated cell: a repeated value and every value the resolver rejects is reported on the cell.
export function lookupMany(
  sheet: string,
  r: ImportRow,
  key: string,
  resolve: (value: string) => { id?: number; error?: [string, string] },
  issues: ImportIssueCollector,
): number[] {
  const seen = new Set<string>();
  const ids: number[] = [];
  for (const v of splitList(r.values[key])) {
    if (seen.has(lower(v))) {
      issues.add(sheet, r.row, key, 'DUPLICATE_VALUE', `"${v}" bị lặp`);
      continue;
    }
    seen.add(lower(v));
    const res = resolve(v);
    if (res.error) issues.add(sheet, r.row, key, res.error[0], res.error[1]);
    else if (res.id !== undefined) ids.push(res.id);
  }
  return ids;
}

// Lookups of rows an upload refers to by code or email, shared by every import. Keys are lower case.
export const lower = (s: string): string => s.toLowerCase();

export interface ConsumerRef {
  id: number;
  // May be picked on a service.
  active: boolean;
}

// Live rows of a table with a `code` column, matched case-insensitively.
export async function codeMap(dataSource: DataSource, table: string, codes: string[]): Promise<Map<string, number>> {
  if (codes.length === 0) return new Map();
  const rows: Array<{ id: number; code: string }> = await dataSource.query(
    `SELECT t.id, t.code FROM ${table} t WHERE LOWER(t.code) = ANY($1) AND ${liveSql('t')} ORDER BY t.id`,
    [codes.map(lower)],
  );
  const out = new Map<string, number>();
  rows.forEach((r) => out.has(lower(r.code)) || out.set(lower(r.code), Number(r.id)));
  return out;
}

export async function consumerMap(dataSource: DataSource, codes: string[]): Promise<Map<string, ConsumerRef>> {
  if (codes.length === 0) return new Map();
  const rows: Array<{ id: number; code: string; status: string }> = await dataSource.query(
    `SELECT c.id, c.code, c.status FROM data_hub_consumers c WHERE LOWER(c.code) = ANY($1) AND ${liveSql('c')}`,
    [codes.map(lower)],
  );
  return new Map(rows.map((r) => [lower(r.code), { id: Number(r.id), active: r.status === 'active' }]));
}

// Live users by email; an email shared by several live users maps to null (cannot tell which one is meant).
// Only id + email are read from users.
export async function userMap(dataSource: DataSource, emails: string[]): Promise<Map<string, number | null>> {
  if (emails.length === 0) return new Map();
  const rows: Array<{ id: number; email: string }> = await dataSource.query(
    `SELECT u.id, u.email FROM users u
     WHERE LOWER(u.email) = ANY($1) AND u.deleted_at IS NULL AND COALESCE(u.is_deleted, false) = false`,
    [emails.map(lower)],
  );
  const out = new Map<string, number | null>();
  rows.forEach((r) => {
    const key = lower(r.email);
    out.set(key, out.has(key) ? null : Number(r.id));
  });
  return out;
}

// Unique non-empty lower-case values.
export const uniqueLower = (values: string[]): string[] => [...new Set(values.filter(Boolean).map(lower))];

type Resolved = { id?: number; error?: [string, string] };

// Resolver of one user email cell value (shared by every import that takes users).
export const resolveUser =
  (users: Map<string, number | null>) =>
  (email: string): Resolved => {
    const id = users.get(lower(email));
    if (id === undefined) return { error: ['USER_NOT_FOUND', `Không có người dùng ${email}`] };
    if (id === null) return { error: ['USER_AMBIGUOUS', `Email ${email} trùng nhiều người dùng`] };
    return { id };
  };

// Resolver of one consumer code cell value; only active apps may be linked to a service.
export const resolveActiveConsumer =
  (consumers: Map<string, ConsumerRef>) =>
  (code: string): Resolved => {
    const c = consumers.get(lower(code));
    if (!c) return { error: ['CODE_NOT_FOUND', `App "${code}" không tồn tại`] };
    if (!c.active) return { error: ['CONSUMER_INACTIVE', `App "${code}" đang ngừng hoạt động`] };
    return { id: c.id };
  };

const logger = new Logger('DataHubImport');

// Message of a failed write: the API's own message for HTTP errors; anything else is logged and hidden.
export const errorText = (err: unknown): string => {
  if (err instanceof HttpException) {
    const body = err.getResponse() as { message?: string | string[] } | string;
    const msg = typeof body === 'string' ? body : body.message;
    return Array.isArray(msg) ? msg.join('; ') : String(msg ?? err.message);
  }
  logger.error(err instanceof Error ? (err.stack ?? err.message) : JSON.stringify(err));
  return 'INTERNAL_ERROR: lỗi hệ thống khi ghi dữ liệu';
};

// Users with a real import running in this process: a re-submit (double click, proxy timeout) would otherwise
// write the same rows a second time. A dry run writes nothing and is never blocked.
export class ImportRunGuard {
  private readonly running = new Set<number>();

  async run<T>(userId: number, dryRun: boolean, work: () => Promise<T>): Promise<T> {
    if (dryRun) return work();
    if (this.running.has(userId)) throw new ConflictException('IMPORT_IN_PROGRESS: đang có lượt import khác chạy');
    this.running.add(userId);
    try {
      return await work();
    } finally {
      this.running.delete(userId);
    }
  }
}

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Multipart `file` (an .xlsx up to 5 MB) held in memory, documented for Swagger.
export const ImportUpload = () =>
  applyDecorators(
    ApiConsumes('multipart/form-data'),
    ApiBody({
      schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } },
    }),
    UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: IMPORT_FILE_BYTES } })),
  );

// The uploaded bytes; a file that is not a valid .xlsx is rejected when exceljs parses it.
export function xlsxUpload(file: Express.Multer.File | undefined): Buffer {
  if (!file?.buffer?.length) {
    throw new BadRequestException('INVALID_FILE: cần file .xlsx theo template');
  }
  return file.buffer;
}

// Sends a template as a download named `<mau|template>-import-<slug>_<date>.xlsx`.
export function sendTemplate(res: Response, buffer: Buffer, slug: string, example: boolean): void {
  const name = `${example ? 'mau-import' : 'template-import'}-${slug}_${dayjs().format('DD-MM-YYYY')}.xlsx`;
  res.setHeader('Content-Type', XLSX_TYPE);
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.send(buffer);
}

// Email of the caller, used in the sample rows of an example download.
export async function callerEmail(dataSource: DataSource, userId: number): Promise<string> {
  const rows: Array<{ email: string | null }> = await dataSource.query('SELECT email FROM users WHERE id = $1', [
    userId,
  ]);
  return rows[0]?.email ?? '';
}

// Codes for the sample rows of an example download. Org codes are typed by hand in a real file, so the sample
// takes real ones from the database; `newest` picks the latest rows so a sample taken right after the earlier
// imports refers to what they just created.
export async function sampleCodes(
  dataSource: DataSource,
  table: string,
  opts: { limit?: number; newest?: boolean; activeOnly?: boolean; column?: string } = {},
): Promise<string[]> {
  const column = opts.column ?? 'code';
  const rows: Array<{ code: string }> = await dataSource.query(
    `SELECT t.${column} AS code FROM ${table} t WHERE ${opts.activeOnly ? activeSql('t') : liveSql('t')}
     ORDER BY t.id ${opts.newest ? 'DESC' : 'ASC'} LIMIT ${Math.trunc(opts.limit ?? 1)}`,
  );
  return rows.map((r) => r.code);
}
