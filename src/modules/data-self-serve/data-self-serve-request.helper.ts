import { APP_IDENTIFIER } from '@configuration/env.config';
import { DataSelfServeRequest } from '@modules/databases/data-self-serve-request.entity';
import * as dayjs from 'dayjs';

export function buildRequestCode(id: number) {
  return `REQ-${new Date().getFullYear()}-${id}`;
}

export function buildRequestParams(
  request: DataSelfServeRequest,
  user: Record<string, unknown>,
  scope: object,
  date: { fromDate: string; toDate: string },
) {
  return {
    request_group: request.request_group,
    request_id: `${request.id}`,
    request_user: String(user.email || '').split('@')[0],
    payload: { scope, date: { from_date: date.fromDate, to_date: date.toDate } },
    source: APP_IDENTIFIER,
  };
}

export function buildInputBackupPath(ext: string, requestId: number, fileNameOriginal: string) {
  const name = `${fileNameOriginal.replace(/\s+/g, '-').replace(/_+/g, '-')}_${dayjs().format('YYYYMMDDHHmmss')}${ext}`;
  return ['portal', 'data_selfserve', 'repayment_schedule', 'input_file', requestId, name].join('/');
}
