import { BadRequestException } from '@nestjs/common';
import { ApiCallMode, ApiHttpMethod, ApiInputFormat } from '@modules/databases/api-catalog-version.entity';
import { validateAndNormalizeSpec } from '../api-spec.util';

const base = {
  http_method: ApiHttpMethod.POST,
  endpoint_path: '/v1/x',
  input_format: ApiInputFormat.BODY,
};

describe('validateAndNormalizeSpec — call_mode + sync_timeout', () => {
  it('requires sync_timeout when call_mode is sync', () => {
    expect(() =>
      validateAndNormalizeSpec({
        ...base,
        call_mode: ApiCallMode.SYNC,
        mock_req: { sync: { a: 1 } },
        mock_res: { sync: { ok: true } },
      }),
    ).toThrow(BadRequestException);
  });

  it('stores trimmed sync_timeout for sync', () => {
    const spec = validateAndNormalizeSpec({
      ...base,
      call_mode: ApiCallMode.SYNC,
      sync_timeout: '  30s  ',
      mock_req: { sync: { a: 1 } },
      mock_res: { sync: { ok: true } },
    });
    expect(spec.sync_timeout).toBe('30s');
  });

  it('rejects sync_timeout on async-only', () => {
    expect(() =>
      validateAndNormalizeSpec({
        ...base,
        call_mode: ApiCallMode.ASYNC,
        sync_timeout: '30s',
        mock_req: { async: { a: 1 } },
        mock_res: { async: { ok: true } },
      }),
    ).toThrow(/INVALID_SYNC_TIMEOUT/);
  });

  it('stores mock_req and mock_res as objects without call_mode wrapping', () => {
    const spec = validateAndNormalizeSpec({
      ...base,
      call_mode: ApiCallMode.SYNC,
      sync_timeout: '30s',
      mock_req: { a: 1, leftover: true },
      mock_res: { ok: true },
    });
    expect(spec.mock_req).toEqual({ a: 1, leftover: true });
    expect(spec.mock_res).toEqual({ ok: true });
  });

  it('accepts mocks that do not match call_mode keys', () => {
    const spec = validateAndNormalizeSpec({
      ...base,
      call_mode: ApiCallMode.ASYNC,
      mock_req: { sync: { a: 1 } },
      mock_res: { sync: { ok: true } },
    });
    expect(spec.mock_req).toEqual({ sync: { a: 1 } });
    expect(spec.mock_res).toEqual({ sync: { ok: true } });
  });

  it('rejects non-object mock_req', () => {
    expect(() =>
      validateAndNormalizeSpec({
        ...base,
        call_mode: ApiCallMode.SYNC,
        sync_timeout: '30s',
        mock_req: [] as unknown as Record<string, unknown>,
        mock_res: { ok: true },
      }),
    ).toThrow(/INVALID_MOCK_REQ/);
  });

  it('keeps upload_file files as an array regardless of call_mode', () => {
    const spec = validateAndNormalizeSpec({
      ...base,
      input_format: ApiInputFormat.UPLOAD_FILE,
      call_mode: ApiCallMode.ASYNC,
      mock_req: {
        fields: { note: 'x' },
        files: [{ url: 'https://cdn.example/a.pdf' }],
      },
      mock_res: { ok: true },
    });
    expect(Array.isArray(spec.mock_req.files)).toBe(true);
  });

  it('rejects upload_file when files is not an array', () => {
    expect(() =>
      validateAndNormalizeSpec({
        ...base,
        input_format: ApiInputFormat.UPLOAD_FILE,
        call_mode: ApiCallMode.SYNC,
        sync_timeout: '30s',
        mock_req: { files: { url: 'https://cdn.example/a.pdf' } },
        mock_res: { ok: true },
      }),
    ).toThrow(/files\[\]/);
  });
});
