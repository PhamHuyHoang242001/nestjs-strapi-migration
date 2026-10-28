import { EntityManager } from 'typeorm';
import { DataHubServiceType } from '@modules/databases/data-hub-enums';

const TYPE_PREFIX: Record<DataHubServiceType, string> = {
  [DataHubServiceType.API]: 'API',
  [DataHubServiceType.SFTP]: 'SFT',
};

// `API-<division code>-` / `SFT-<division code>-`; the sequence number is appended by nextServiceCode.
export const buildServiceCodePrefix = (type: DataHubServiceType, divisionCode: string): string =>
  `${TYPE_PREFIX[type]}-${divisionCode}-`;

export const formatServiceCode = (prefix: string, sequence: number): string =>
  `${prefix}${String(sequence).padStart(3, '0')}`;

// Next free code for a prefix. The transaction-scoped advisory lock serializes concurrent creates of the same
// prefix so two requests cannot read the same max. Soft-deleted rows count: a code is never handed out twice.
// The suffix must be all digits and the prefix exact, so division `FOO` never collides with `FOO-BAR`.
export async function nextServiceCode(manager: EntityManager, prefix: string): Promise<string> {
  await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [prefix]);
  const rows: Array<{ max_no: number | string }> = await manager.query(
    `SELECT COALESCE(MAX(substring(service_code FROM char_length($1::text) + 1)::int), 0) AS max_no
     FROM data_hub_data_services
     WHERE left(service_code, char_length($1::text)) = $1::text
       AND substring(service_code FROM char_length($1::text) + 1) ~ '^[0-9]+$'`,
    [prefix],
  );
  return formatServiceCode(prefix, Number(rows[0]?.max_no ?? 0) + 1);
}
