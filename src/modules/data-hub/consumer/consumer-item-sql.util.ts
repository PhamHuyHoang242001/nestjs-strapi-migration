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
  status: string;
  division_id: number | null;
  division_code: string | null;
  division_name: string | null;
  department_id: number | null;
  department_code: string | null;
  department_name: string | null;
}

// Columns + joins shared by the list and detail reads. Org joins are LEFT so a retired
// division/department does not hide the consumer, it just renders as null.
export const CONSUMER_ITEM_COLUMNS = `
  c.id, c.code, c.name, c.category, c.short_description, c.status,
  dv.id AS division_id, dv.code AS division_code, dv.name AS division_name,
  dp.id AS department_id, dp.code AS department_code, dp.name AS department_name`;

export const CONSUMER_ITEM_JOINS = `
  LEFT JOIN data_hub_divisions dv ON dv.id = c.division_id AND ${liveSql('dv')}
  LEFT JOIN data_hub_departments dp ON dp.id = c.department_id AND ${liveSql('dp')}`;
