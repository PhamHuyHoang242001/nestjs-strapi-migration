import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ApiDataServiceSpecDto } from '../dto/api-data-service-spec.dto';

const base = {
  method: 'GET',
  base_url: 'API_INT',
  endpoint_path: '/v1/x',
  auth_type: 'CLIENT_ID',
  update_frequency: 'REALTIME',
};

const invalidFields = (plain: Record<string, unknown>) =>
  validateSync(plainToInstance(ApiDataServiceSpecDto, { ...base, ...plain })).map((e) => e.property);

describe('ApiDataServiceSpecDto timeout rule', () => {
  it('SYNC requires a timeout', () => {
    expect(invalidFields({ sync_mode: 'SYNC' })).toEqual(['timeout']);
    expect(invalidFields({ sync_mode: 'SYNC', timeout: '' })).toEqual(['timeout']);
    expect(invalidFields({ sync_mode: 'SYNC', timeout: '30s' })).toEqual([]);
    expect(invalidFields({ sync_mode: 'SYNC', timeout: 30 })).toEqual([]);
  });

  it('ASYNC and BATCH may leave the timeout empty', () => {
    for (const sync_mode of ['ASYNC', 'BATCH']) {
      expect(invalidFields({ sync_mode })).toEqual([]);
      expect(invalidFields({ sync_mode, timeout: '' })).toEqual([]);
      expect(invalidFields({ sync_mode, timeout: null })).toEqual([]);
    }
  });

  it('a timeout given for ASYNC is still validated (length)', () => {
    expect(invalidFields({ sync_mode: 'ASYNC', timeout: '60s' })).toEqual([]);
    expect(invalidFields({ sync_mode: 'ASYNC', timeout: 'x'.repeat(101) })).toEqual(['timeout']);
  });
});
