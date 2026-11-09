import { liveSql } from '../common/data-hub-query.util';

export interface OrgRef {
  id: number;
  code: string;
  name: string;
}

export interface ConsumerListRow {
  id: number;
  code: string;
  name: string;
  category: string;
  short_description: string;
  avatar_url: string | null;
  status: string;
  division_id: number | null;
  division_code: string | null;
  division_name: string | null;
  system_id: number | null;
  system_name: string | null;
  system_service: string | null;
}

// Columns + joins shared by the list and detail reads. The division / system joins are LEFT so a retired
// row does not hide the consumer, it just renders as null.
export const CONSUMER_ITEM_COLUMNS = `
  c.id, c.code, c.name, c.category, c.short_description, c.avatar_url, c.status,
  dv.id AS division_id, dv.code AS division_code, dv.name AS division_name,
  sy.id AS system_id, sy.name AS system_name, c.system_service`;

export const CONSUMER_ITEM_JOINS = `
  LEFT JOIN data_hub_divisions dv ON dv.id = c.division_id AND ${liveSql('dv')}
  LEFT JOIN data_hub_systems sy ON sy.id = c.system_id AND ${liveSql('sy')}`;
