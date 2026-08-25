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

  it('requires mock key matching call_mode', () => {
    expect(() =>
      validateAndNormalizeSpec({
        ...base,
        call_mode: ApiCallMode.ASYNC,
        mock_req: { sync: { a: 1 } },
        mock_res: { sync: { ok: true } },
      }),
    ).toThrow(/missing async/);
  });
});
