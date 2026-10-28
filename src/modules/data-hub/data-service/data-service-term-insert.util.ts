import { EntityManager } from 'typeorm';
import { queryRows } from './data-service-query-rows.util';

// New terms in one statement. Ids are taken from the table's sequence first and handed out in ascending order,
// so each term gets the same id it would get from row-by-row inserts in body order.
export async function insertTerms(
  manager: EntityManager,
  dataServiceId: number,
  userId: number,
  terms: Array<{
    code: string;
    technical_description: string;
    data_type: string;
    is_required: boolean;
    example_value: string | null;
    source_table_id: number;
    logical_term_id?: number | null;
  }>,
): Promise<number[]> {
  if (terms.length === 0) return [];
  const reserved = await queryRows<{ id: number }>(
    manager,
    `SELECT nextval(pg_get_serial_sequence('data_hub_physical_terms', 'id'))::int AS id FROM generate_series(1, $1)`,
    [terms.length],
  );
  const ids = reserved.map((r) => Number(r.id)).sort((a, b) => a - b);
  await manager.query(
    `INSERT INTO data_hub_physical_terms
       (id, code, technical_description, data_type, is_required, example_value, source_table_id, logical_term_id,
        data_service_id, created_by)
     SELECT u.id, u.code, u.technical_description, u.data_type, u.is_required, u.example_value, u.source_table_id,
            u.logical_term_id, $9, $10
     FROM UNNEST($1::int[], $2::text[], $3::text[], $4::text[], $5::boolean[], $6::text[], $7::int[], $8::int[])
       AS u(id, code, technical_description, data_type, is_required, example_value, source_table_id, logical_term_id)`,
    [
      ids,
      terms.map((t) => t.code),
      terms.map((t) => t.technical_description),
      terms.map((t) => t.data_type),
      terms.map((t) => t.is_required),
      terms.map((t) => t.example_value),
      terms.map((t) => t.source_table_id),
      terms.map((t) => t.logical_term_id ?? null),
      dataServiceId,
      userId,
    ],
  );
  return ids;
}
