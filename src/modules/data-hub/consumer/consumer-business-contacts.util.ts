import { DataSource, EntityManager } from 'typeorm';
import { sqlRows } from './consumer-sql.util';

// Business-contact links of many consumers in one query, ordered by link id so the display order is the order they were added.
export async function loadBusinessContactUserIds(
  runner: DataSource | EntityManager,
  consumerIds: number[],
): Promise<Map<number, number[]>> {
  const result = new Map<number, number[]>();
  if (consumerIds.length === 0) return result;
  const rows = await sqlRows<{ consumer_id: number; user_id: number }>(
    runner,
    `SELECT l.consumer_id, l.user_id FROM data_hub_consumer_business_contacts l
     WHERE l.consumer_id = ANY($1) ORDER BY l.id`,
    [consumerIds],
  );
  for (const r of rows) {
    const list = result.get(Number(r.consumer_id)) ?? [];
    list.push(Number(r.user_id));
    result.set(Number(r.consumer_id), list);
  }
  return result;
}

// Whole-set replace: links are hard-deleted, so there is nothing to soft-restore.
export async function replaceBusinessContacts(
  manager: EntityManager,
  consumerId: number,
  userIds: number[],
): Promise<void> {
  await manager.query('DELETE FROM data_hub_consumer_business_contacts WHERE consumer_id = $1', [consumerId]);
  if (userIds.length === 0) return;
  await manager.query(
    `INSERT INTO data_hub_consumer_business_contacts (consumer_id, user_id)
     SELECT $1, u FROM UNNEST($2::int[]) WITH ORDINALITY AS t(u, ord) ORDER BY ord`,
    [consumerId, userIds],
  );
}
