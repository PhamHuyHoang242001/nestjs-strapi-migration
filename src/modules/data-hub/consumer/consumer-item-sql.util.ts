import { liveSql } from '../common/data-hub-query.util';

export interface ConsumerListRow {
  id: number;
  code: string;
  name: string;
  category: string;
  short_description: string;
  avatar_url: string | null;
  status: string;
  owner_unit_id: number | null;
  owner_unit_name: string | null;
  system_id: number | null;
  system_name: string | null;
  system_service: string | null;
}

// Columns + joins shared by the list and detail reads. The owner unit / system joins are LEFT so a retired
// row does not hide the consumer, it just renders as null.
export const CONSUMER_ITEM_COLUMNS = `
  c.id, c.code, c.name, c.category, c.short_description, c.avatar_url, c.status,
  ou.id AS owner_unit_id, ou.name AS owner_unit_name,
  sy.id AS system_id, sy.name AS system_name, c.system_service`;

export const CONSUMER_ITEM_JOINS = `
  LEFT JOIN data_hub_owner_units ou ON ou.id = c.owner_unit_id AND ${liveSql('ou')}
  LEFT JOIN data_hub_systems sy ON sy.id = c.system_id AND ${liveSql('sy')}`;
