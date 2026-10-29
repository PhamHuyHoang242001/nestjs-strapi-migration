import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ApiDataServiceSpecDto } from '../dto/api-data-service-spec.dto';
import { SftpDataServiceSpecDto } from '../dto/sftp-data-service-spec.dto';

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

  it('ASYNC may leave the timeout empty', () => {
    expect(invalidFields({ sync_mode: 'ASYNC' })).toEqual([]);
    expect(invalidFields({ sync_mode: 'ASYNC', timeout: '' })).toEqual([]);
    expect(invalidFields({ sync_mode: 'ASYNC', timeout: null })).toEqual([]);
  });

  it('BATCH is no longer a sync mode', () => {
    expect(invalidFields({ sync_mode: 'BATCH' })).toContain('sync_mode');
  });

  it('a timeout given for ASYNC is still validated (length)', () => {
    expect(invalidFields({ sync_mode: 'ASYNC', timeout: '60s' })).toEqual([]);
    expect(invalidFields({ sync_mode: 'ASYNC', timeout: 'x'.repeat(101) })).toEqual(['timeout']);
  });
});

describe('removed spec fields', () => {
  const rejected = (cls: new () => object, plain: Record<string, unknown>) =>
    validateSync(plainToInstance(cls, plain), { whitelist: true, forbidNonWhitelisted: true }).map((e) => e.property);

  it('the API spec no longer accepts the token endpoint or token auth method', () => {
    const plain = { ...base, sync_mode: 'ASYNC', token_endpoint: '/oauth2/token', token_auth_method: 'BASIC' };
    expect(rejected(ApiDataServiceSpecDto, plain).sort()).toEqual(['token_auth_method', 'token_endpoint']);
  });

  it('the SFTP spec no longer accepts host, port, auth type or vault fields', () => {
    const plain = {
      file_format: 'CSV',
      export_frequency: 'HOURLY',
      encryption: 'NONE',
      host: 'h',
      port: 22,
      auth_type: 'SSH_KEY',
      key_vault_method: 'HSM_VAULT',
      vault_account: 'svc',
    };
    expect(rejected(SftpDataServiceSpecDto, plain).sort()).toEqual(
      ['auth_type', 'host', 'key_vault_method', 'port', 'vault_account'].sort(),
    );
  });
});
