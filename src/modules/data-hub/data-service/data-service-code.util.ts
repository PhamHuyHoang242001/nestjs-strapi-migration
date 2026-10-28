import { EntityManager } from 'typeorm';
import { DataHubServiceType } from '@modules/databases/data-hub-enums';

const TYPE_PREFIX: Record<DataHubServiceType, string> = {
  [DataHubServiceType.API]: 'API',
  [DataHubServiceType.SFTP]: 'SFTP',
};

// `[SERVICE]_<division code>_<department code>_<id>`, e.g. API_EDA_DPD_1, SFTP_IT_DPIS_23. The id makes the
// code unique, so it is rebuilt whenever the division or department of the active version changes.
export const buildServiceCode = (
  type: DataHubServiceType,
  divisionCode: string,
  departmentCode: string,
  id: number,
): string => `${TYPE_PREFIX[type]}_${divisionCode}_${departmentCode}_${id}`;

// The new service's id is taken from its sequence before the insert, so the code (which carries the id) is
// written in the same INSERT.
export async function reserveServiceId(manager: EntityManager): Promise<number> {
  const [row]: Array<{ id: number | string }> = await manager.query(
    `SELECT nextval(pg_get_serial_sequence('data_hub_data_services', 'id')) AS id`,
  );
  return Number(row.id);
}
