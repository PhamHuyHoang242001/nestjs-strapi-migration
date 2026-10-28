import { DataHubServiceType } from '@modules/databases/data-hub-enums';
import { buildServiceCode, reserveServiceId } from '../data-service-code.util';

describe('service code', () => {
  it('builds [SERVICE]_<division>_<department>_<id>', () => {
    expect(buildServiceCode(DataHubServiceType.API, 'EDA', 'DPD', 1)).toBe('API_EDA_DPD_1');
    expect(buildServiceCode(DataHubServiceType.SFTP, 'IT', 'DPIS', 23)).toBe('SFTP_IT_DPIS_23');
  });

  it('reserves the id from the services sequence', async () => {
    const query = jest.fn<Promise<unknown>, [string]>().mockResolvedValue([{ id: '42' }]);
    await expect(reserveServiceId({ query } as never)).resolves.toBe(42);
    expect(query.mock.calls[0][0]).toContain("pg_get_serial_sequence('data_hub_data_services', 'id')");
  });
});
