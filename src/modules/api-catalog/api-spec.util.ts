import { BadRequestException } from '@nestjs/common';
import { ApiCallMode, ApiHttpMethod, ApiInputFormat, ApiVersion } from '@modules/databases/api-catalog-version.entity';

export interface ApiSpecInput {
  http_method: ApiHttpMethod;
  endpoint_path: string;
  input_format: ApiInputFormat;
  call_mode: ApiCallMode;
  sync_timeout?: string;
  sla?: string;
  tps?: string;
  latency_p95?: string;
  throughput?: string;
  max_payload?: string;
  rate_limit?: string;
  encryption?: string;
  mock_req?: Record<string, unknown>;
  mock_res?: Record<string, unknown>;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function assertMockReqShape(format: ApiInputFormat, payload: unknown, mode: string): void {
  if (!isPlainObject(payload)) {
    throw new BadRequestException(`INVALID_MOCK_REQ: ${mode} must be an object matching input_format`);
  }
  if (format === ApiInputFormat.UPLOAD_FILE) {
    if (!isPlainObject(payload.fields) || !Array.isArray(payload.files)) {
      throw new BadRequestException('INVALID_MOCK_REQ: upload_file requires { fields, files[] }');
    }
    const files = payload.files as Array<Record<string, unknown>>;
    if (!files.length) {
      throw new BadRequestException('INVALID_MOCK_REQ: upload_file requires at least one sample file');
    }
    for (const file of files) {
      if (!isPlainObject(file) || typeof file.url !== 'string' || !file.url.trim()) {
        throw new BadRequestException('INVALID_MOCK_REQ: each sample file needs a url');
      }
    }
  }
}

export function validateAndNormalizeSpec(dto: ApiSpecInput): ApiSpecInput {
  const call_mode = dto.call_mode ?? ApiCallMode.SYNC;
  const timeout = (dto.sync_timeout ?? '').trim();
  if (call_mode === ApiCallMode.ASYNC) {
    if (timeout) {
      throw new BadRequestException('INVALID_SYNC_TIMEOUT: async APIs must not set sync_timeout');
    }
  } else if (!timeout) {
    throw new BadRequestException('INVALID_SYNC_TIMEOUT: required when call_mode is sync');
  }

  const mock_req = isPlainObject(dto.mock_req) ? dto.mock_req : {};
  const mock_res = isPlainObject(dto.mock_res) ? dto.mock_res : {};
  const mode = call_mode;

  if (!(mode in mock_req)) {
    throw new BadRequestException(`INVALID_MOCK_REQ: missing ${mode} sample`);
  }
  assertMockReqShape(dto.input_format, mock_req[mode], mode);
  if (!(mode in mock_res) || !isPlainObject(mock_res[mode])) {
    throw new BadRequestException(`INVALID_MOCK_RES: ${mode} must be a JSON object`);
  }

  return {
    ...dto,
    call_mode,
    sync_timeout: call_mode === ApiCallMode.ASYNC ? undefined : timeout,
    mock_req,
    mock_res,
  };
}

export function specColumns(spec: ApiSpecInput) {
  return {
    http_method: spec.http_method,
    endpoint_path: spec.endpoint_path,
    input_format: spec.input_format,
    call_mode: spec.call_mode,
    sync_timeout: spec.call_mode === ApiCallMode.ASYNC ? null : (spec.sync_timeout ?? null),
    sla: spec.sla ?? null,
    tps: spec.tps ?? null,
    latency_p95: spec.latency_p95 ?? null,
    throughput: spec.throughput ?? null,
    max_payload: spec.max_payload ?? null,
    rate_limit: spec.rate_limit ?? null,
    encryption: spec.encryption ?? null,
    mock_req: spec.mock_req ?? {},
    mock_res: spec.mock_res ?? {},
  };
}

export function stringifyApiSpec(version: Pick<ApiVersion, 'http_method' | 'endpoint_path' | 'input_format' | 'call_mode' | 'sync_timeout' | 'mock_req' | 'mock_res' | 'usage_guide_html'>): string {
  return JSON.stringify(
    {
      http_method: version.http_method,
      endpoint_path: version.endpoint_path,
      input_format: version.input_format,
      call_mode: version.call_mode,
      sync_timeout: version.sync_timeout,
      mock_req: version.mock_req,
      mock_res: version.mock_res,
      usage_guide_html: version.usage_guide_html,
    },
    null,
    2,
  );
}
